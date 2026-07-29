from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

import numpy as np

from .game import (
    ACTION_SIZE,
    ADJACENCY,
    MILLS,
    MILLS_BY_POINT,
    NineMensMorris,
    decode_action,
)
from .selfplay import HistoryItem, SelfPlayResult, finalize_samples


def _mill_count(state: NineMensMorris, player: int) -> int:
    return sum(
        all(state.board[point] == player for point in mill)
        for mill in MILLS
    )


def _open_mills(state: NineMensMorris, player: int) -> tuple[int, int]:
    open_count = 0
    double_count = 0
    for point, value in enumerate(state.board):
        if value != 0:
            continue
        ways = sum(
            sum(state.board[index] == player for index in mill) == 2
            and sum(state.board[index] == 0 for index in mill) == 1
            for mill in MILLS_BY_POINT[point]
        )
        open_count += ways
        double_count += max(0, ways - 1)
    return open_count, double_count


def _mobility(state: NineMensMorris, player: int) -> int:
    if state.hand_count(player) > 0:
        return state.board.count(0)
    pieces = state.piece_count(player)
    if pieces == 3:
        return state.board.count(0) * 3
    return sum(
        len(state.movement_targets(source, player))
        for source in state.pieces(player)
    )


def _raw_features(state: NineMensMorris, player: int) -> dict[str, int]:
    pieces = state.pieces(player)
    placing = sum(state.hand) > 0
    open_count, double_count = _open_mills(state, player)
    blocked = 0
    anchor = 0
    protected = 0
    for point in pieces:
        anchor += len(ADJACENCY[point])
        protected += int(state.in_mill(point, player))
        if (
            not placing
            and len(pieces) > 3
            and all(state.board[target] != 0 for target in ADJACENCY[point])
        ):
            blocked += 1
    return {
        "men": len(pieces),
        "hand": state.hand_count(player),
        "total": len(pieces) + state.hand_count(player),
        "mills": _mill_count(state, player),
        "open": open_count,
        "double": double_count,
        "blocked": blocked,
        "mobility": _mobility(state, player),
        "anchor": anchor,
        "protected": protected,
    }


def heuristic_value(state: NineMensMorris) -> float:
    """Current-player evaluation adapted from the browser Negamax AI."""
    player = state.player
    own = _raw_features(state, player)
    opponent = _raw_features(state, -player)
    placing = sum(state.hand) > 0
    flying = own["men"] == 3 or opponent["men"] == 3
    if placing:
        weights = {
            "men": 0,
            "hand": 0,
            "total": 190,
            "mills": 38,
            "open": 36,
            "double": 100,
            "blocked": 4,
            "mobility": 1,
            "anchor": 5,
            "protected": 5,
        }
    else:
        weights = {
            "men": 280 if flying else 210,
            "hand": 0,
            "total": 0,
            "mills": 58,
            "open": 34,
            "double": 110,
            "blocked": 42,
            "mobility": 4 if flying else 12,
            "anchor": 3,
            "protected": 8,
        }
    raw = sum(
        (own[name] - opponent[name]) * weight
        for name, weight in weights.items()
    )
    if not placing and own["men"] > 3 and own["mobility"] <= 2:
        raw -= 180
    if not placing and opponent["men"] > 3 and opponent["mobility"] <= 2:
        raw += 180
    return math.tanh(raw / 600.0)


@dataclass(slots=True)
class Teacher:
    depth: int = 3
    policy_temperature: float = 0.12
    nodes: int = field(init=False, default=0)
    _table: dict[tuple[object, int], float] = field(
        init=False,
        default_factory=dict,
        repr=False,
    )

    def __post_init__(self) -> None:
        if self.depth < 1:
            raise ValueError("teacher depth must be positive")
        if self.policy_temperature <= 0:
            raise ValueError("policy temperature must be positive")

    def _negamax(
        self,
        state: NineMensMorris,
        depth: int,
        alpha: float,
        beta: float,
        path: set[object],
    ) -> float:
        self.nodes += 1
        if state.is_terminal():
            return state.outcome()
        if depth <= 0 and not state.removing:
            return heuristic_value(state)
        key = (state.key(), depth)
        cached = self._table.get(key)
        if cached is not None:
            return cached

        best = -2.0
        cutoff = False
        for action in self.ordered_actions(state):
            child = state.play(action)
            position = child.position_key()
            if position in path:
                score = 0.0
            else:
                path.add(position)
                if child.player == state.player:
                    score = self._negamax(child, depth, alpha, beta, path)
                else:
                    score = -self._negamax(
                        child,
                        depth - 1,
                        -beta,
                        -alpha,
                        path,
                    )
                path.remove(position)
            best = max(best, score)
            alpha = max(alpha, score)
            if alpha >= beta:
                cutoff = True
                break
        if not cutoff:
            self._table[key] = best
        return best

    def ordered_actions(self, state: NineMensMorris) -> tuple[int, ...]:
        def rank(action: int) -> tuple[int, int]:
            child = state.play(action)
            capture = int(decode_action(action).kind == "capture")
            mill = int(child.removing)
            return capture, mill

        return tuple(sorted(state.legal_actions(), key=rank, reverse=True))

    def scores(self, state: NineMensMorris) -> dict[int, float]:
        if state.is_terminal():
            return {}
        self.nodes = 0
        self._table.clear()
        path = {state.position_key()}
        scores: dict[int, float] = {}
        for action in self.ordered_actions(state):
            child = state.play(action)
            path.add(child.position_key())
            if child.player == state.player:
                score = self._negamax(
                    child,
                    self.depth,
                    -1.1,
                    1.1,
                    path,
                )
            else:
                score = -self._negamax(
                    child,
                    self.depth - 1,
                    -1.1,
                    1.1,
                    path,
                )
            path.remove(child.position_key())
            scores[action] = score
        return scores

    def policy(self, state: NineMensMorris) -> np.ndarray:
        scores = self.scores(state)
        policy = np.zeros(ACTION_SIZE, dtype=np.float32)
        if not scores:
            return policy
        actions = np.fromiter(scores.keys(), dtype=np.int64)
        values = np.fromiter(scores.values(), dtype=np.float64)
        values = np.exp(
            (values - values.max()) / self.policy_temperature
        )
        values /= values.sum()
        policy[actions] = values.astype(np.float32)
        return policy


def play_teacher_game(
    teacher: Teacher,
    rng: random.Random,
    epsilon: float = 0.12,
    repetition_limit: int = 3,
    max_actions: int = 512,
) -> SelfPlayResult:
    state = NineMensMorris()
    history: list[HistoryItem] = []
    repetitions = {state.position_key(): 1}
    termination = "action_limit"

    while not state.is_terminal() and len(history) < max_actions:
        policy = teacher.policy(state)
        history.append((state, policy))
        legal = state.legal_actions()
        if rng.random() < epsilon:
            action = rng.choice(legal)
        else:
            action = int(np.argmax(policy))
        state = state.play(action)
        key = state.position_key()
        repetitions[key] = repetitions.get(key, 0) + 1
        if repetitions[key] >= repetition_limit:
            termination = "repetition"
            break

    if state.is_terminal():
        winner = state.winner()
        termination = "draw_limit" if state.is_draw() else "win"
    else:
        winner = 0
    return SelfPlayResult(
        samples=finalize_samples(history, winner),
        winner=winner,
        actions=len(history),
        termination=termination,
    )
