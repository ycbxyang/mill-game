from __future__ import annotations

import random
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .model import PolicyValueNet
from .selfplay import Sample, play_game
from .game import ConnectFour
from .solver import tactical_policy


@dataclass(slots=True)
class TrainConfig:
    iterations: int = 20
    games_per_iteration: int = 32
    simulations: int = 96
    epochs: int = 4
    batch_size: int = 128
    replay_size: int = 100_000
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    channels: int = 64
    blocks: int = 4
    teacher_positions_per_iteration: int = 512
    seed: int = 20260724


def choose_device(requested: str = "auto") -> torch.device:
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but PyTorch cannot access the GPU")
    return torch.device(requested)


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def random_position(rng: random.Random, max_ply: int = 34) -> ConnectFour:
    while True:
        state = ConnectFour()
        for _ in range(rng.randint(0, max_ply)):
            if state.is_terminal():
                break
            state = state.play(rng.choice(state.legal_actions()))
        if not state.is_terminal():
            return state


def teacher_samples(count: int, rng: random.Random) -> list[Sample]:
    """Create policy-only rehearsal samples to prevent tactical forgetting."""
    samples: list[Sample] = []
    while len(samples) < count:
        state = random_position(rng)
        policy = np.asarray(tactical_policy(state), dtype=np.float32)
        samples.append(Sample(state.encode(), policy, 0.0, value_weight=0.0))
        if len(samples) < count:
            samples.append(
                Sample(
                    state.mirrored().encode(),
                    ConnectFour.mirror_policy(policy),
                    0.0,
                    value_weight=0.0,
                )
            )
    return samples


def optimize(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    replay: deque[Sample],
    config: TrainConfig,
    device: torch.device,
) -> dict[str, float]:
    states = torch.from_numpy(np.stack([item.state for item in replay]))
    policies = torch.from_numpy(np.stack([item.policy for item in replay]))
    values = torch.tensor([item.value for item in replay], dtype=torch.float32)
    value_weights = torch.tensor(
        [item.value_weight for item in replay], dtype=torch.float32
    )
    loader = DataLoader(
        TensorDataset(states, policies, values, value_weights),
        batch_size=config.batch_size,
        shuffle=True,
        pin_memory=device.type == "cuda",
    )

    model.train()
    policy_total = value_total = batches = 0
    for _ in range(config.epochs):
        for x, target_policy, target_value, value_weight in loader:
            x = x.to(device, non_blocking=True)
            target_policy = target_policy.to(device, non_blocking=True)
            target_value = target_value.to(device, non_blocking=True)
            value_weight = value_weight.to(device, non_blocking=True)
            logits, value = model(x)
            policy_loss = -(target_policy * torch.log_softmax(logits, dim=1)).sum(1).mean()
            squared_error = nn.functional.mse_loss(
                value, target_value, reduction="none"
            )
            value_loss = (squared_error * value_weight).sum() / value_weight.sum().clamp_min(1.0)
            loss = policy_loss + value_loss
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            policy_total += float(policy_loss.item())
            value_total += float(value_loss.item())
            batches += 1
    return {
        "policy_loss": policy_total / max(1, batches),
        "value_loss": value_total / max(1, batches),
    }


def save_checkpoint(
    path: Path,
    model: PolicyValueNet,
    optimizer: torch.optim.Optimizer,
    iteration: int,
    config: TrainConfig,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "iteration": iteration,
            "config": asdict(config),
            "architecture": {"channels": model.channels, "blocks": model.blocks},
        },
        path,
    )


def run_training(
    config: TrainConfig,
    output: Path,
    device_name: str = "auto",
    resume: Path | None = None,
) -> Path:
    seed_everything(config.seed)
    device = choose_device(device_name)
    model = PolicyValueNet(config.channels, config.blocks).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )
    replay: deque[Sample] = deque(maxlen=config.replay_size)
    teacher_rng = random.Random(config.seed + 1)
    start_iteration = 1
    if resume is not None:
        saved = torch.load(resume, map_location=device, weights_only=False)
        architecture = saved.get("architecture", {})
        expected = {"channels": config.channels, "blocks": config.blocks}
        if architecture and architecture != expected:
            raise ValueError(
                f"checkpoint architecture {architecture} does not match {expected}"
            )
        model.load_state_dict(saved["model"])
        if "optimizer" in saved:
            optimizer.load_state_dict(saved["optimizer"])
        start_iteration = int(saved.get("iteration", 0)) + 1
        print(f"resumed={resume} next_iteration={start_iteration}")

    print(f"device={device} parameters={sum(p.numel() for p in model.parameters()):,}")
    latest = output / "latest.pt"
    for iteration in range(start_iteration, start_iteration + config.iterations):
        wins = {1: 0, -1: 0, 0: 0}
        for game in range(1, config.games_per_iteration + 1):
            samples, winner = play_game(model, device, config.simulations)
            replay.extend(samples)
            wins[winner] += 1
            print(
                f"iteration={iteration} self_play={game}/{config.games_per_iteration} "
                f"samples={len(replay)}",
                flush=True,
            )
        replay.extend(
            teacher_samples(config.teacher_positions_per_iteration, teacher_rng)
        )
        metrics = optimize(model, optimizer, replay, config, device)
        save_checkpoint(latest, model, optimizer, iteration, config)
        save_checkpoint(output / f"iteration-{iteration:04d}.pt", model, optimizer, iteration, config)
        print(
            f"iteration={iteration} wins={wins} "
            f"policy_loss={metrics['policy_loss']:.4f} "
            f"value_loss={metrics['value_loss']:.4f}",
            flush=True,
        )
    return latest
