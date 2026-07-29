from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from connect_four.game import ConnectFour
from connect_four.model import PolicyValueNet
from connect_four.solver import tactical_policy
from connect_four.training import choose_device, save_checkpoint, seed_everything, TrainConfig


def random_position(rng: random.Random, max_ply: int = 34) -> ConnectFour:
    state = ConnectFour()
    target = rng.randint(0, max_ply)
    for _ in range(target):
        if state.is_terminal():
            return random_position(rng, max_ply)
        state = state.play(rng.choice(state.legal_actions()))
    return state


def build_dataset(count: int, seed: int) -> tuple[torch.Tensor, torch.Tensor]:
    rng = random.Random(seed)
    states: list[np.ndarray] = []
    policies: list[np.ndarray] = []
    while len(states) < count:
        state = random_position(rng)
        if state.is_terminal():
            continue
        policy = np.asarray(tactical_policy(state), dtype=np.float32)
        states.extend((state.encode(), state.mirrored().encode()))
        policies.extend((policy, ConnectFour.mirror_policy(policy)))
    return (
        torch.from_numpy(np.stack(states[:count])),
        torch.from_numpy(np.stack(policies[:count])),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Warm-start the policy head with tactical/center teacher targets"
    )
    parser.add_argument("--positions", type=int, default=50_000)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--channels", type=int, default=64)
    parser.add_argument("--blocks", type=int, default=4)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--output", type=Path, default=Path("checkpoints/pretrained.pt"))
    parser.add_argument("--seed", type=int, default=20260724)
    args = parser.parse_args()

    seed_everything(args.seed)
    device = choose_device(args.device)
    states, policies = build_dataset(args.positions, args.seed)
    loader = DataLoader(
        TensorDataset(states, policies),
        batch_size=args.batch_size,
        shuffle=True,
        pin_memory=device.type == "cuda",
    )
    model = PolicyValueNet(args.channels, args.blocks).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    for epoch in range(1, args.epochs + 1):
        model.train()
        total = batches = 0
        for x, target in loader:
            x = x.to(device, non_blocking=True)
            target = target.to(device, non_blocking=True)
            logits, _ = model(x)
            loss = -(target * torch.log_softmax(logits, dim=1)).sum(1).mean()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            total += float(loss.item())
            batches += 1
        print(f"epoch={epoch}/{args.epochs} policy_loss={total / batches:.4f}")

    config = TrainConfig(channels=args.channels, blocks=args.blocks, seed=args.seed)
    save_checkpoint(args.output, model, optimizer, 0, config)
    print(f"complete checkpoint={args.output}")


if __name__ == "__main__":
    main()
