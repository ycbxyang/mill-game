from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

from .game import ConnectFour
from .mcts import MCTS, sample_action


@dataclass(slots=True)
class Sample:
    state: np.ndarray
    policy: np.ndarray
    value: float
    value_weight: float = 1.0


def play_game(
    model: torch.nn.Module,
    device: torch.device,
    simulations: int,
    temperature_moves: int = 12,
) -> tuple[list[Sample], int]:
    state = ConnectFour()
    history: list[tuple[ConnectFour, np.ndarray]] = []
    search = MCTS(model, device, simulations=simulations)
    model.eval()

    while not state.is_terminal():
        policy = search.search(state, add_noise=True)
        history.append((state, policy))
        temperature = 1.0 if state.ply < temperature_moves else 0.0
        state = state.play(sample_action(policy, temperature))

    winner = state.winner()
    samples: list[Sample] = []
    for position, policy in history:
        value = 0.0 if winner == 0 else (1.0 if winner == position.player else -1.0)
        samples.append(Sample(position.encode(), policy, value))
        samples.append(
            Sample(
                position.mirrored().encode(),
                ConnectFour.mirror_policy(policy),
                value,
            )
        )
    return samples, winner
