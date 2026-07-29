from __future__ import annotations

import argparse
import random
from pathlib import Path

import torch

from morris.arena import NetworkAgent, TeacherAgent, play_match, random_opening
from morris.model import MorrisPolicyValueNet
from morris.training import choose_device, seed_everything


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate a Morris checkpoint against the Negamax teacher"
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("checkpoints/pretrained.pt"),
    )
    parser.add_argument("--games", type=int, default=20)
    parser.add_argument("--teacher-depth", type=int, default=3)
    parser.add_argument(
        "--opponent-checkpoint",
        type=Path,
        help="compare against another network instead of the teacher",
    )
    parser.add_argument(
        "--simulations",
        type=int,
        default=0,
        help="MCTS simulations per network move; 0 tests the raw policy",
    )
    parser.add_argument(
        "--opponent-simulations",
        type=int,
        help="MCTS simulations for the opponent network; defaults to --simulations",
    )
    parser.add_argument("--opening-actions", type=int, default=2)
    parser.add_argument("--max-actions", type=int, default=512)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--seed", type=int, default=20260727)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.games < 2 or args.games % 2:
        raise ValueError("games must be a positive even number of at least 2")
    seed_everything(args.seed)
    device = choose_device(args.device)
    network = NetworkAgent(
        load_model(args.checkpoint, device),
        device,
        simulations=args.simulations,
    )
    if args.opponent_checkpoint is None:
        opponent = TeacherAgent(depth=args.teacher_depth)
        opponent_name = f"teacher-depth-{args.teacher_depth}"
    else:
        opponent_simulations = (
            args.simulations
            if args.opponent_simulations is None
            else args.opponent_simulations
        )
        opponent = NetworkAgent(
            load_model(args.opponent_checkpoint, device),
            device,
            simulations=opponent_simulations,
        )
        opponent_name = str(args.opponent_checkpoint)
    print(f"candidate={args.checkpoint} opponent={opponent_name}", flush=True)
    rng = random.Random(args.seed)
    results = {"win": 0, "draw": 0, "loss": 0}
    endings: dict[str, int] = {}

    for pair in range(1, args.games // 2 + 1):
        opening, repetitions = random_opening(rng, args.opening_actions)
        assignments = (
            (network, opponent, 1),
            (opponent, network, -1),
        )
        for plus_agent, minus_agent, network_side in assignments:
            result = play_match(
                plus_agent,
                minus_agent,
                initial_state=opening,
                initial_repetitions=repetitions,
                max_actions=args.max_actions,
            )
            if result.winner == 0:
                outcome = "draw"
            elif result.winner == network_side:
                outcome = "win"
            else:
                outcome = "loss"
            results[outcome] += 1
            endings[result.termination] = endings.get(result.termination, 0) + 1
            completed = sum(results.values())
            print(
                f"arena={completed}/{args.games} pair={pair} "
                f"network_side={network_side:+d} actions={result.actions} "
                f"winner={result.winner:+d} result={outcome}",
                flush=True,
            )

    score = (results["win"] + 0.5 * results["draw"]) / args.games
    print(
        f"complete games={args.games} results={results} endings={endings} "
        f"score={score:.3f}",
        flush=True,
    )


def load_model(path: Path, device: torch.device) -> MorrisPolicyValueNet:
    saved = torch.load(path, map_location=device, weights_only=False)
    architecture = saved["architecture"]
    model = MorrisPolicyValueNet(
        architecture["channels"],
        architecture["blocks"],
    ).to(device)
    model.load_state_dict(saved["model"])
    model.eval()
    return model


if __name__ == "__main__":
    main()
