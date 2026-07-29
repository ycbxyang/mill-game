from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import torch

from .game import NineMensMorris
from .mcts import MCTS
from .teacher import Teacher


class Agent(Protocol):
    def select_action(self, state: NineMensMorris) -> int: ...


@dataclass(frozen=True, slots=True)
class MatchResult:
    winner: int
    actions: int
    termination: str


class NetworkAgent:
    def __init__(
        self,
        model: torch.nn.Module,
        device: torch.device,
        simulations: int = 0,
    ) -> None:
        if simulations < 0:
            raise ValueError("simulations cannot be negative")
        self.search = MCTS(
            model,
            device,
            simulations=max(1, simulations),
        )
        self.simulations = simulations

    def select_action(self, state: NineMensMorris) -> int:
        if self.simulations:
            policy = self.search.search(state, add_noise=False)
        else:
            policy, _ = self.search.evaluate(state)
        return int(np.argmax(policy))


class TeacherAgent:
    def __init__(self, depth: int = 3) -> None:
        self.teacher = Teacher(depth=depth)

    def select_action(self, state: NineMensMorris) -> int:
        return int(np.argmax(self.teacher.policy(state)))


def random_opening(
    rng: random.Random,
    actions: int,
) -> tuple[NineMensMorris, dict[object, int]]:
    if actions < 0:
        raise ValueError("opening actions cannot be negative")
    state = NineMensMorris()
    repetitions: dict[object, int] = {state.position_key(): 1}
    for _ in range(actions):
        if state.is_terminal():
            break
        state = state.play(rng.choice(state.legal_actions()))
        key = state.position_key()
        repetitions[key] = repetitions.get(key, 0) + 1
    return state, repetitions


def play_match(
    plus_agent: Agent,
    minus_agent: Agent,
    initial_state: NineMensMorris | None = None,
    initial_repetitions: dict[object, int] | None = None,
    repetition_limit: int = 3,
    max_actions: int = 512,
) -> MatchResult:
    if repetition_limit < 2:
        raise ValueError("repetition limit must be at least 2")
    if max_actions < 1:
        raise ValueError("max actions must be positive")
    state = initial_state or NineMensMorris()
    repetitions = (
        dict(initial_repetitions)
        if initial_repetitions is not None
        else {state.position_key(): 1}
    )
    termination = "action_limit"
    actions = 0

    while not state.is_terminal() and actions < max_actions:
        agent = plus_agent if state.player == 1 else minus_agent
        action = agent.select_action(state)
        if action not in state.legal_actions():
            raise RuntimeError(f"agent selected illegal action {action}")
        state = state.play(action)
        actions += 1
        key = state.position_key()
        repetitions[key] = repetitions.get(key, 0) + 1
        if repetitions[key] >= repetition_limit:
            termination = "repetition"
            break

    if state.is_terminal():
        termination = "draw_limit" if state.is_draw() else "win"
        winner = state.winner()
    else:
        winner = 0
    return MatchResult(winner, actions, termination)
