from __future__ import annotations

import argparse
import os
import random
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import torch

from morris.model import MorrisPolicyValueNet
from morris.replay import ReplayBuffer
from morris.teacher import Teacher, play_teacher_game
from morris.training import (
    TrainConfig,
    choose_device,
    optimize,
    save_checkpoint,
    seed_everything,
)


def _teacher_job(
    game_index: int,
    seed: int,
    depth: int,
    epsilon: float,
    max_actions: int,
) -> tuple[int, object, int]:
    """Generate one deterministic game in a worker process."""
    teacher = Teacher(depth=depth)
    result = play_teacher_game(
        teacher,
        random.Random(seed),
        epsilon=epsilon,
        max_actions=max_actions,
    )
    return game_index, result, teacher.nodes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Warm-start Morris policy/value net from the Negamax teacher"
    )
    parser.add_argument("--games", type=int, default=500)
    parser.add_argument("--teacher-depth", type=int, default=3)
    parser.add_argument("--epsilon", type=float, default=0.12)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--channels", type=int, default=64)
    parser.add_argument("--blocks", type=int, default=4)
    parser.add_argument("--max-actions", type=int, default=512)
    parser.add_argument(
        "--workers",
        type=int,
        default=0,
        help="parallel teacher processes; 0 selects half the logical CPUs, up to 8",
    )
    parser.add_argument(
        "--save-every",
        type=int,
        default=25,
        help="persist partial teacher data after this many completed games",
    )
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("checkpoints/pretrained.pt"),
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=Path("data/teacher-replay.npz"),
    )
    parser.add_argument("--reuse-data", action="store_true")
    parser.add_argument("--no-symmetry-augmentation", action="store_true")
    parser.add_argument("--seed", type=int, default=20260727)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.games < 1:
        raise ValueError("games must be positive")
    if args.workers < 0:
        raise ValueError("workers cannot be negative")
    if args.save_every < 1:
        raise ValueError("save-every must be positive")
    seed_everything(args.seed)
    if args.reuse_data:
        replay = ReplayBuffer.load(args.data)
        print(f"loaded teacher replay={len(replay)} from {args.data}", flush=True)
    else:
        replay = ReplayBuffer(capacity=max(args.games * args.max_actions, 1))
        endings: dict[str, int] = {}
        workers = args.workers or min(
            8,
            max(1, (os.cpu_count() or 2) // 2),
        )
        print(f"teacher workers={workers}", flush=True)

        jobs = (
            (
                game,
                args.seed + game * 1_000_003,
                args.teacher_depth,
                args.epsilon,
                args.max_actions,
            )
            for game in range(1, args.games + 1)
        )
        if workers == 1:
            results = map(lambda job: _teacher_job(*job), jobs)
            pool = None
        else:
            pool = ProcessPoolExecutor(max_workers=workers)
            futures = [pool.submit(_teacher_job, *job) for job in jobs]
            results = (future.result() for future in as_completed(futures))

        completed = 0
        for game, result, nodes in results:
            completed += 1
            replay.extend(result.samples)
            endings[result.termination] = endings.get(result.termination, 0) + 1
            print(
                f"teacher_game={completed}/{args.games} source_game={game} "
                f"actions={result.actions} winner={result.winner:+d} "
                f"nodes={nodes} replay={len(replay)}",
                flush=True,
            )
            if completed % args.save_every == 0:
                replay.save(args.data)
                print(
                    f"autosaved teacher replay={len(replay)} games={completed}",
                    flush=True,
                )
        if pool is not None:
            pool.shutdown()
        replay.save(args.data)
        print(f"saved teacher replay={len(replay)} endings={endings}", flush=True)

    device = choose_device(args.device)
    model = MorrisPolicyValueNet(args.channels, args.blocks).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    config = TrainConfig(
        iterations=1,
        games_per_iteration=1,
        simulations=1,
        epochs=args.epochs,
        batch_size=args.batch_size,
        replay_size=replay.capacity,
        channels=args.channels,
        blocks=args.blocks,
        max_actions=args.max_actions,
        symmetry_augmentation=not args.no_symmetry_augmentation,
        seed=args.seed,
    )
    metrics = optimize(model, optimizer, replay, config, device)
    save_checkpoint(args.output, model, optimizer, 0, config)
    print(
        f"complete checkpoint={args.output} replay={len(replay)} "
        f"policy_loss={metrics['policy_loss']:.4f} "
        f"value_loss={metrics['value_loss']:.4f}",
        flush=True,
    )


if __name__ == "__main__":
    main()
