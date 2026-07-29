from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import torch

from .game import ACTION_SIZE, NineMensMorris


@dataclass(slots=True)
class Node:
    prior: np.ndarray = field(
        default_factory=lambda: np.zeros(ACTION_SIZE, dtype=np.float32)
    )
    visits: np.ndarray = field(
        default_factory=lambda: np.zeros(ACTION_SIZE, dtype=np.int32)
    )
    value_sum: np.ndarray = field(
        default_factory=lambda: np.zeros(ACTION_SIZE, dtype=np.float32)
    )
    children: dict[int, "Node"] = field(default_factory=dict)
    expanded: bool = False

    def q(self) -> np.ndarray:
        return np.divide(
            self.value_sum,
            self.visits,
            out=np.zeros(ACTION_SIZE, dtype=np.float32),
            where=self.visits > 0,
        )


PathEdge = tuple[Node, int, bool]


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
        if simulations < 1:
            raise ValueError("simulations must be positive")
        self.model = model
        self.device = device
        self.simulations = simulations
        self.c_puct = c_puct
        self.dirichlet_alpha = dirichlet_alpha
        self.dirichlet_fraction = dirichlet_fraction
        self.model.eval()

    @torch.inference_mode()
    def evaluate(self, state: NineMensMorris) -> tuple[np.ndarray, float]:
        policies, values = self.evaluate_many((state,))
        return policies[0], float(values[0])

    @torch.inference_mode()
    def evaluate_many(
        self,
        states: tuple[NineMensMorris, ...] | list[NineMensMorris],
    ) -> tuple[np.ndarray, np.ndarray]:
        if not states:
            return (
                np.empty((0, ACTION_SIZE), dtype=np.float32),
                np.empty(0, dtype=np.float32),
            )
        encoded = torch.from_numpy(
            np.stack([state.encode() for state in states])
        ).to(self.device)
        if self.device.type == "cuda":
            dtype = (
                torch.bfloat16
                if torch.cuda.is_bf16_supported()
                else torch.float16
            )
            with torch.autocast(device_type="cuda", dtype=dtype):
                logits, values = self.model(encoded)
        else:
            logits, values = self.model(encoded)

        masks = np.stack([state.legal_mask() for state in states])
        raw = logits.float().cpu().numpy()
        raw = np.where(masks > 0, raw, -1e9)
        raw -= raw.max(axis=1, keepdims=True)
        policies = np.exp(raw) * masks
        totals = policies.sum(axis=1, keepdims=True)
        invalid = totals[:, 0] <= 0
        policies = np.divide(
            policies,
            totals,
            out=np.zeros_like(policies),
            where=totals > 0,
        )
        for index in np.flatnonzero(invalid):
            legal = np.flatnonzero(masks[index])
            policies[index, legal] = 1.0 / len(legal)
        return (
            policies.astype(np.float32),
            values.float().cpu().numpy().astype(np.float32),
        )

    @staticmethod
    def backpropagate(path: list[PathEdge], leaf_value: float) -> None:
        """Back up a leaf value while respecting removal sub-turns.

        Values are always stored from the player at the parent node. A normal
        move changes player and flips the sign. Closing a mill keeps the same
        player for the capture action and therefore does not flip the sign.
        """
        value = leaf_value
        for node, action, switched_player in reversed(path):
            if switched_player:
                value = -value
            node.visits[action] += 1
            node.value_sum[action] += value

    def search(
        self,
        root_state: NineMensMorris,
        add_noise: bool = True,
    ) -> np.ndarray:
        return self.search_many((root_state,), add_noise=add_noise)[0]

    def search_many(
        self,
        root_states: tuple[NineMensMorris, ...] | list[NineMensMorris],
        add_noise: bool = True,
    ) -> np.ndarray:
        if not root_states:
            return np.empty((0, ACTION_SIZE), dtype=np.float32)
        roots = [Node() for _ in root_states]
        active = [
            index
            for index, state in enumerate(root_states)
            if not state.is_terminal()
        ]
        if active:
            priors, _ = self.evaluate_many([root_states[index] for index in active])
            for index, prior in zip(active, priors):
                root = roots[index]
                root.prior = prior
                root.expanded = True
                if add_noise:
                    legal = np.flatnonzero(root.prior > 0)
                    noise = np.random.dirichlet(
                        [self.dirichlet_alpha] * len(legal)
                    )
                    root.prior[legal] = (
                        (1.0 - self.dirichlet_fraction) * root.prior[legal]
                        + self.dirichlet_fraction * noise
                    )

        for _ in range(self.simulations):
            leaves: list[tuple[Node, NineMensMorris, list[PathEdge]]] = []
            for index in active:
                node = roots[index]
                state = root_states[index]
                path: list[PathEdge] = []

                while node.expanded and not state.is_terminal():
                    mask = state.legal_mask()
                    total_visits = max(1, int(node.visits.sum()))
                    exploration = (
                        self.c_puct
                        * node.prior
                        * math.sqrt(total_visits)
                        / (1.0 + node.visits)
                    )
                    score = np.where(
                        mask > 0,
                        node.q() + exploration,
                        -1e9,
                    )
                    action = int(np.argmax(score))
                    child_state = state.play(action)
                    switched_player = child_state.player != state.player
                    path.append((node, action, switched_player))
                    state = child_state
                    node = node.children.setdefault(action, Node())

                if state.is_terminal():
                    self.backpropagate(path, state.outcome())
                else:
                    leaves.append((node, state, path))

            if leaves:
                priors, values = self.evaluate_many(
                    [state for _, state, _ in leaves]
                )
                for (node, _, path), prior, value in zip(
                    leaves,
                    priors,
                    values,
                ):
                    node.prior = prior
                    node.expanded = True
                    self.backpropagate(path, float(value))

        policies = np.zeros(
            (len(root_states), ACTION_SIZE),
            dtype=np.float32,
        )
        for index in active:
            root = roots[index]
            visits = root.visits.astype(np.float32)
            total = float(visits.sum())
            policies[index] = (
                root.prior.copy() if total <= 0 else visits / total
            )
        return policies


def sample_action(policy: np.ndarray, temperature: float) -> int:
    legal = np.flatnonzero(policy > 0)
    if len(legal) == 0:
        raise ValueError("policy has no legal action")
    if temperature <= 1e-6:
        return int(np.argmax(policy))
    adjusted = np.power(policy[legal], 1.0 / temperature)
    adjusted /= adjusted.sum()
    return int(np.random.choice(legal, p=adjusted))
