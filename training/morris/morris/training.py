from __future__ import annotations

import os
import random
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .model import MorrisPolicyValueNet
from .replay import ReplayBuffer
from .selfplay import play_games_batched
from .symmetry import augment_batch, inverse_tensors


@dataclass(slots=True)
class TrainConfig:
    iterations: int = 20
    games_per_iteration: int = 32
    self_play_batch_size: int = 8
    simulations: int = 96
    epochs: int = 4
    batch_size: int = 128
    replay_size: int = 100_000
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    value_loss_weight: float = 1.0
    channels: int = 64
    blocks: int = 4
    temperature_actions: int = 24
    repetition_limit: int = 3
    max_actions: int = 512
    symmetry_augmentation: bool = True
    seed: int = 20260727

    def __post_init__(self) -> None:
        positive = (
            "iterations",
            "games_per_iteration",
            "self_play_batch_size",
            "simulations",
            "epochs",
            "batch_size",
            "replay_size",
            "channels",
            "blocks",
            "max_actions",
        )
        for name in positive:
            if getattr(self, name) < 1:
                raise ValueError(f"{name} must be positive")
        if self.learning_rate <= 0:
            raise ValueError("learning_rate must be positive")
        if self.weight_decay < 0:
            raise ValueError("weight_decay cannot be negative")
        if self.value_loss_weight <= 0:
            raise ValueError("value_loss_weight must be positive")


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


def optimize(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    replay: ReplayBuffer,
    config: TrainConfig,
    device: torch.device,
) -> dict[str, float]:
    if len(replay) == 0:
        raise ValueError("cannot optimize with an empty replay buffer")
    states, policies, values = replay.arrays()
    if device.type == "cuda":
        required = states.nbytes + policies.nbytes + values.nbytes
        free_memory, _ = torch.cuda.mem_get_info(device)
        if required < free_memory * 0.6:
            return _optimize_cuda_resident(
                model,
                optimizer,
                states,
                policies,
                values,
                config,
                device,
            )

    loader = DataLoader(
        TensorDataset(
            torch.from_numpy(states),
            torch.from_numpy(policies),
            torch.from_numpy(values),
        ),
        batch_size=min(config.batch_size, len(replay)),
        shuffle=True,
        pin_memory=device.type == "cuda",
    )
    symmetry_tensors = (
        inverse_tensors(device) if config.symmetry_augmentation else None
    )

    model.train()
    policy_total = value_total = batches = 0
    for _ in range(config.epochs):
        for state, target_policy, target_value in loader:
            state = state.to(device, non_blocking=True)
            target_policy = target_policy.to(device, non_blocking=True)
            target_value = target_value.to(device, non_blocking=True)
            if symmetry_tensors is not None:
                state, target_policy = augment_batch(
                    state,
                    target_policy,
                    *symmetry_tensors,
                )
            logits, value = model(state)
            policy_loss = -(
                target_policy * torch.log_softmax(logits, dim=1)
            ).sum(dim=1).mean()
            value_loss = nn.functional.mse_loss(value, target_value)
            loss = policy_loss + config.value_loss_weight * value_loss
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            policy_total += float(policy_loss.item())
            value_total += float(value_loss.item())
            batches += 1

    return {
        "policy_loss": policy_total / batches,
        "value_loss": value_total / batches,
    }


def _optimize_cuda_resident(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    states: np.ndarray,
    policies: np.ndarray,
    values: np.ndarray,
    config: TrainConfig,
    device: torch.device,
) -> dict[str, float]:
    """Keep a small in-memory replay on the GPU to avoid per-batch transfers."""
    torch.set_float32_matmul_precision("high")
    state_tensor = torch.from_numpy(states).to(device)
    policy_tensor = torch.from_numpy(policies).to(device)
    value_tensor = torch.from_numpy(values).to(device)
    batch_size = min(config.batch_size, len(states))
    use_bfloat16 = torch.cuda.is_bf16_supported()
    amp_dtype = torch.bfloat16 if use_bfloat16 else torch.float16
    scaler = torch.amp.GradScaler("cuda", enabled=not use_bfloat16)
    symmetry_tensors = (
        inverse_tensors(device) if config.symmetry_augmentation else None
    )
    precision = "bfloat16" if use_bfloat16 else "float16"
    print(
        f"optimizer cuda_mode=resident samples={len(states)} "
        f"batch={batch_size} precision={precision}",
        flush=True,
    )

    model.train()
    policy_total = value_total = batches = 0
    for _ in range(config.epochs):
        order = torch.randperm(len(states), device=device)
        for start in range(0, len(states), batch_size):
            indices = order[start : start + batch_size]
            state = state_tensor[indices]
            target_policy = policy_tensor[indices]
            target_value = value_tensor[indices]
            if symmetry_tensors is not None:
                state, target_policy = augment_batch(
                    state,
                    target_policy,
                    *symmetry_tensors,
                )
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(
                device_type="cuda",
                dtype=amp_dtype,
            ):
                logits, value = model(state)
                policy_loss = -(
                    target_policy * torch.log_softmax(logits, dim=1)
                ).sum(dim=1).mean()
                value_loss = nn.functional.mse_loss(value, target_value)
                loss = policy_loss + config.value_loss_weight * value_loss
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            scaler.step(optimizer)
            scaler.update()
            policy_total += float(policy_loss.item())
            value_total += float(value_loss.item())
            batches += 1

    return {
        "policy_loss": policy_total / batches,
        "value_loss": value_total / batches,
    }


def save_checkpoint(
    path: str | Path,
    model: MorrisPolicyValueNet,
    optimizer: torch.optim.Optimizer,
    iteration: int,
    config: TrainConfig,
) -> Path:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "format_version": 1,
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "iteration": iteration,
        "config": asdict(config),
        "architecture": {
            "channels": model.channels,
            "blocks": model.blocks,
        },
    }
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            torch.save(payload, temporary)
        os.replace(temporary_name, destination)
    except Exception:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)
        raise
    return destination


def restore_checkpoint(
    path: str | Path,
    model: MorrisPolicyValueNet,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> int:
    saved = torch.load(path, map_location=device, weights_only=False)
    if int(saved.get("format_version", 0)) != 1:
        raise ValueError("unsupported checkpoint format")
    expected = {"channels": model.channels, "blocks": model.blocks}
    if saved.get("architecture") != expected:
        raise ValueError(
            f"checkpoint architecture {saved.get('architecture')} does not match {expected}"
        )
    model.load_state_dict(saved["model"])
    optimizer.load_state_dict(saved["optimizer"])
    return int(saved["iteration"])


def run_training(
    config: TrainConfig,
    output: str | Path,
    device_name: str = "auto",
    resume: str | Path | None = None,
    initial_replay: str | Path | None = None,
) -> Path:
    seed_everything(config.seed)
    output_path = Path(output)
    output_path.mkdir(parents=True, exist_ok=True)
    replay_path = output_path / "replay.npz"
    device = choose_device(device_name)
    model = MorrisPolicyValueNet(config.channels, config.blocks).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )
    if replay_path.exists():
        replay = ReplayBuffer.load(replay_path, capacity=config.replay_size)
    elif initial_replay is not None:
        replay = ReplayBuffer.load(initial_replay, capacity=config.replay_size)
        print(
            f"seeded replay={len(replay)} from {initial_replay}",
            flush=True,
        )
    else:
        replay = ReplayBuffer(config.replay_size)
    start_iteration = 1
    if resume is not None:
        completed = restore_checkpoint(resume, model, optimizer, device)
        for group in optimizer.param_groups:
            group["lr"] = config.learning_rate
            group["weight_decay"] = config.weight_decay
        start_iteration = completed + 1
        print(
            f"resumed={resume} next_iteration={start_iteration} replay={len(replay)}",
            flush=True,
        )

    parameters = sum(parameter.numel() for parameter in model.parameters())
    print(
        f"device={device} parameters={parameters:,} replay={len(replay)}",
        flush=True,
    )
    latest = output_path / "latest.pt"
    for iteration in range(start_iteration, start_iteration + config.iterations):
        results = {1: 0, -1: 0, 0: 0}
        terminations: dict[str, int] = {}
        completed_games = 0
        while completed_games < config.games_per_iteration:
            batch_games = min(
                config.self_play_batch_size,
                config.games_per_iteration - completed_games,
            )
            batch_results = play_games_batched(
                model,
                device,
                simulations=config.simulations,
                games=batch_games,
                temperature_actions=config.temperature_actions,
                repetition_limit=config.repetition_limit,
                max_actions=config.max_actions,
            )
            for result in batch_results:
                completed_games += 1
                replay.extend(result.samples)
                results[result.winner] += 1
                terminations[result.termination] = (
                    terminations.get(result.termination, 0) + 1
                )
                print(
                    f"iteration={iteration} self_play={completed_games}/"
                    f"{config.games_per_iteration} actions={result.actions} "
                    f"replay={len(replay)}",
                    flush=True,
                )

        metrics = optimize(model, optimizer, replay, config, device)
        replay.save(replay_path)
        save_checkpoint(latest, model, optimizer, iteration, config)
        save_checkpoint(
            output_path / f"iteration-{iteration:04d}.pt",
            model,
            optimizer,
            iteration,
            config,
        )
        print(
            f"iteration={iteration} wins={results} endings={terminations} "
            f"policy_loss={metrics['policy_loss']:.4f} "
            f"value_loss={metrics['value_loss']:.4f}",
            flush=True,
        )
    return latest
