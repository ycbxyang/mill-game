from __future__ import annotations

import argparse
from pathlib import Path

from morris.training import TrainConfig, run_training


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train the Nine Men's Morris policy/value network"
    )
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--games", type=int, default=32)
    parser.add_argument("--self-play-batch-size", type=int, default=8)
    parser.add_argument("--simulations", type=int, default=96)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--replay-size", type=int, default=100_000)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--value-loss-weight", type=float, default=1.0)
    parser.add_argument("--channels", type=int, default=64)
    parser.add_argument("--blocks", type=int, default=4)
    parser.add_argument("--temperature-actions", type=int, default=24)
    parser.add_argument("--repetition-limit", type=int, default=3)
    parser.add_argument("--max-actions", type=int, default=512)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--output", type=Path, default=Path("checkpoints"))
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--initial-replay", type=Path)
    parser.add_argument("--no-symmetry-augmentation", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = TrainConfig(
        iterations=args.iterations,
        games_per_iteration=args.games,
        self_play_batch_size=args.self_play_batch_size,
        simulations=args.simulations,
        epochs=args.epochs,
        batch_size=args.batch_size,
        replay_size=args.replay_size,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        value_loss_weight=args.value_loss_weight,
        channels=args.channels,
        blocks=args.blocks,
        temperature_actions=args.temperature_actions,
        repetition_limit=args.repetition_limit,
        max_actions=args.max_actions,
        symmetry_augmentation=not args.no_symmetry_augmentation,
    )
    checkpoint = run_training(
        config,
        output=args.output,
        device_name=args.device,
        resume=args.resume,
        initial_replay=args.initial_replay,
    )
    print(f"complete checkpoint={checkpoint}")


if __name__ == "__main__":
    main()
