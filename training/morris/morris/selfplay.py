from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

from .game import ACTION_SIZE, FEATURE_PLANES, POINTS, NineMensMorris
from .mcts import MCTS, sample_action


@dataclass(slots=True)
class Sample:
    state: np.ndarray
    policy: np.ndarray
    value: float


@dataclass(slots=True)
class SelfPlayResult:
    samples: list[Sample]
    winner: int
    actions: int
    termination: str


HistoryItem = tuple[NineMensMorris, np.ndarray]


@dataclass(slots=True)
class _GameSlot:
    state: NineMensMorris
    history: list[HistoryItem]
    repetitions: dict[object, int]
    termination: str = "action_limit"
    finished: bool = False


def finalize_samples(history: list[HistoryItem], winner: int) -> list[Sample]:
    samples: list[Sample] = []
    for state, policy in history:
        value = 0.0 if winner == 0 else (1.0 if winner == state.player else -1.0)
        samples.append(
            Sample(
                state=state.encode(),
                policy=np.asarray(policy, dtype=np.float32).copy(),
                value=value,
            )
        )
    return samples


def play_game(
    model: torch.nn.Module,
    device: torch.device,
    simulations: int,
    temperature_actions: int = 24,
    repetition_limit: int = 3,
    max_actions: int = 512,
) -> SelfPlayResult:
    return play_games_batched(
        model,
        device,
        simulations,
        games=1,
        temperature_actions=temperature_actions,
        repetition_limit=repetition_limit,
        max_actions=max_actions,
    )[0]


def play_games_batched(
    model: torch.nn.Module,
    device: torch.device,
    simulations: int,
    games: int,
    temperature_actions: int = 24,
    repetition_limit: int = 3,
    max_actions: int = 512,
) -> list[SelfPlayResult]:
    if games < 1:
        raise ValueError("games must be positive")
    if repetition_limit < 2:
        raise ValueError("repetition_limit must be at least 2")
    if max_actions < 1:
        raise ValueError("max_actions must be positive")

    model.eval()
    search = MCTS(model, device, simulations=simulations)
    slots: list[_GameSlot] = []
    for _ in range(games):
        state = NineMensMorris()
        slots.append(
            _GameSlot(
                state=state,
                history=[],
                repetitions={state.position_key(): 1},
            )
        )

    while True:
        active = [slot for slot in slots if not slot.finished]
        if not active:
            break
        policies = search.search_many(
            [slot.state for slot in active],
            add_noise=True,
        )
        for slot, policy in zip(active, policies):
            if policy.shape != (ACTION_SIZE,) or not np.isfinite(policy).all():
                raise RuntimeError("MCTS returned an invalid policy")
            slot.history.append((slot.state, policy))
            temperature = (
                1.0 if len(slot.history) <= temperature_actions else 0.0
            )
            action = sample_action(policy, temperature)
            if action not in slot.state.legal_actions():
                raise RuntimeError(f"MCTS selected illegal action {action}")
            slot.state = slot.state.play(action)

            key = slot.state.position_key()
            slot.repetitions[key] = slot.repetitions.get(key, 0) + 1
            if slot.repetitions[key] >= repetition_limit:
                slot.termination = "repetition"
                slot.finished = True
            elif slot.state.is_terminal():
                slot.termination = (
                    "draw_limit" if slot.state.is_draw() else "win"
                )
                slot.finished = True
            elif len(slot.history) >= max_actions:
                slot.finished = True

    results: list[SelfPlayResult] = []
    for slot in slots:
        winner = slot.state.winner() if slot.state.is_terminal() else 0
        results.append(
            SelfPlayResult(
                samples=finalize_samples(slot.history, winner),
                winner=winner,
                actions=len(slot.history),
                termination=slot.termination,
            )
        )
    return results


def validate_sample(sample: Sample) -> None:
    if sample.state.shape != (FEATURE_PLANES, POINTS):
        raise ValueError("sample has invalid state shape")
    if sample.policy.shape != (ACTION_SIZE,):
        raise ValueError("sample has invalid policy shape")
    if not np.isfinite(sample.state).all() or not np.isfinite(sample.policy).all():
        raise ValueError("sample contains non-finite values")
    if not np.isclose(sample.policy.sum(), 1.0, atol=1e-5):
        raise ValueError("sample policy must sum to one")
    if sample.value not in (-1.0, 0.0, 1.0):
        raise ValueError("sample value must be -1, 0, or 1")
