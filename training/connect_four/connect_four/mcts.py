from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import torch

from .game import COLS, ConnectFour
from .solver import tactical_actions


@dataclass(slots=True)
class Node:
    prior: np.ndarray = field(default_factory=lambda: np.zeros(COLS, dtype=np.float32))
    visits: np.ndarray = field(default_factory=lambda: np.zeros(COLS, dtype=np.int32))
    value_sum: np.ndarray = field(default_factory=lambda: np.zeros(COLS, dtype=np.float32))
    children: dict[int, "Node"] = field(default_factory=dict)
    expanded: bool = False

    def q(self) -> np.ndarray:
        return np.divide(
            self.value_sum,
            self.visits,
            out=np.zeros(COLS, dtype=np.float32),
            where=self.visits > 0,
        )


class MCTS:
    def __init__(
        self,
        model: torch.nn.Module,
        device: torch.device,
        simulations: int = 96,
        c_puct: float = 1.5,
        dirichlet_alpha: float = 0.3,
        dirichlet_fraction: float = 0.25,
    ) -> None:
        self.model = model
        self.device = device
        self.simulations = simulations
        self.c_puct = c_puct
        self.dirichlet_alpha = dirichlet_alpha
        self.dirichlet_fraction = dirichlet_fraction
        self.model.eval()

    @torch.inference_mode()
    def _evaluate(self, state: ConnectFour) -> tuple[np.ndarray, float]:
        x = torch.from_numpy(state.encode()).unsqueeze(0).to(self.device)
        logits, value = self.model(x)
        legal = np.zeros(COLS, dtype=np.float32)
        legal[list(tactical_actions(state))] = 1.0
        raw = logits[0].detach().cpu().numpy()
        raw = np.where(legal > 0, raw, -1e9)
        raw -= raw.max()
        policy = np.exp(raw) * legal
        policy /= max(float(policy.sum()), 1e-8)
        return policy.astype(np.float32), float(value.item())

    def search(self, root_state: ConnectFour, add_noise: bool = True) -> np.ndarray:
        if root_state.is_terminal():
            return np.zeros(COLS, dtype=np.float32)
        root = Node()
        root.prior, _ = self._evaluate(root_state)
        root.expanded = True
        if add_noise:
            legal = np.flatnonzero(root.prior > 0)
            noise = np.random.dirichlet([self.dirichlet_alpha] * len(legal))
            root.prior[legal] = (
                (1.0 - self.dirichlet_fraction) * root.prior[legal]
                + self.dirichlet_fraction * noise
            )

        for _ in range(self.simulations):
            node, state = root, root_state
            path: list[tuple[Node, int]] = []
            while node.expanded and not state.is_terminal():
                legal = np.zeros(COLS, dtype=np.float32)
                legal[list(tactical_actions(state))] = 1.0
                total = max(1, int(node.visits.sum()))
                score = node.q() + self.c_puct * node.prior * math.sqrt(total) / (
                    1.0 + node.visits
                )
                score = np.where(legal > 0, score, -1e9)
                action = int(np.argmax(score))
                path.append((node, action))
                state = state.play(action)
                node = node.children.setdefault(action, Node())

            if state.is_terminal():
                value = state.outcome()
            else:
                node.prior, value = self._evaluate(state)
                node.expanded = True

            for parent, action in reversed(path):
                value = -value
                parent.visits[action] += 1
                parent.value_sum[action] += value

        visits = root.visits.astype(np.float32)
        if visits.sum() == 0:
            return root.prior.copy()
        return visits / visits.sum()


def sample_action(policy: np.ndarray, temperature: float) -> int:
    legal = np.flatnonzero(policy > 0)
    if len(legal) == 0:
        raise ValueError("policy has no legal action")
    if temperature <= 1e-6:
        return int(np.argmax(policy))
    adjusted = np.power(policy[legal], 1.0 / temperature)
    adjusted /= adjusted.sum()
    return int(np.random.choice(legal, p=adjusted))
