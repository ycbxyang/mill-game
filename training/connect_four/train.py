from __future__ import annotations

import argparse
from pathlib import Path

from connect_four.training import TrainConfig, run_training


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the Connect Four policy/value net")
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--games", type=int, default=32)
    parser.add_argument("--simulations", type=int, default=96)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--channels", type=int, default=64)
    parser.add_argument("--blocks", type=int, default=4)
    parser.add_argument("--teacher-positions", type=int, default=512)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--output", type=Path, default=Path("checkpoints"))
    parser.add_argument("--resume", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = TrainConfig(
        iterations=args.iterations,
        games_per_iteration=args.games,
        simulations=args.simulations,
        epochs=args.epochs,
        batch_size=args.batch_size,
        channels=args.channels,
        blocks=args.blocks,
        teacher_positions_per_iteration=args.teacher_positions,
    )
    checkpoint = run_training(config, args.output, args.device, args.resume)
    print(f"complete checkpoint={checkpoint}")


if __name__ == "__main__":
    main()
