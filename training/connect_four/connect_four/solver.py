from __future__ import annotations

from dataclasses import dataclass

from .game import COLS, ConnectFour


@dataclass(slots=True)
class SolveResult:
    value: int
    best_actions: tuple[int, ...]
    nodes: int


class EndgameSolver:
    """Exact negamax solver for late-game positions.

    This is deliberately used only when few empty cells remain. It is an exact
    benchmark/teacher for those positions, not a claim to solve the initial
    Connect Four position quickly.
    """

    def __init__(self) -> None:
        self.cache: dict[tuple[tuple[int, ...], int], int] = {}
        self.nodes = 0

    def solve(self, state: ConnectFour, max_empty: int = 14) -> SolveResult:
        empty = 42 - state.ply
        if empty > max_empty:
            raise ValueError(
                f"exact solve limited to {max_empty} empty cells; position has {empty}"
            )
        self.nodes = 0
        if state.is_terminal():
            return SolveResult(int(state.outcome()), (), 1)

        best = -2
        actions: list[int] = []
        for action in state.legal_actions():
            value = -self._negamax(state.play(action), -1, 1)
            if value > best:
                best, actions = value, [action]
            elif value == best:
                actions.append(action)
            if best == 1:
                # Still inspect moves only if callers want every winning move.
                continue
        return SolveResult(best, tuple(actions), self.nodes)

    def _negamax(self, state: ConnectFour, alpha: int, beta: int) -> int:
        self.nodes += 1
        if state.is_terminal():
            return int(state.outcome())
        key = state.key()
        hit = self.cache.get(key)
        if hit is not None:
            return hit

        best = -2
        cutoff = False
        for action in state.legal_actions():
            score = -self._negamax(state.play(action), -beta, -alpha)
            best = max(best, score)
            alpha = max(alpha, score)
            if alpha >= beta:
                cutoff = True
                break
        if not cutoff:
            self.cache[key] = best
        return best


def tactical_policy(state: ConnectFour) -> list[float]:
    """Simple teacher target: immediate wins, blocks, then center preference."""
    legal = state.legal_actions()
    if not legal:
        return [0.0] * COLS

    wins = [a for a in legal if state.play(a).winner() == state.player]
    candidates = wins
    if not candidates:
        opponent_wins = {
            a
            for a in legal
            if ConnectFour(state.board, -state.player, state.ply).play(a).winner()
            == -state.player
        }
        candidates = [a for a in legal if a in opponent_wins] or list(legal)

    weights = [0.0] * COLS
    center_weight = (1.0, 2.0, 3.0, 4.0, 3.0, 2.0, 1.0)
    total = sum(center_weight[action] for action in candidates)
    for action in candidates:
        weights[action] = center_weight[action] / total
    return weights


def tactical_actions(state: ConnectFour) -> tuple[int, ...]:
    """Return moves that respect one-ply wins and mandatory blocks.

    A winning move always takes priority. If the opponent can win on the next
    move, search is restricted to columns that remove that threat. With two
    independent threats the position is normally lost, but blocking one of
    them is still preferable to ignoring both.
    """
    legal = state.legal_actions()
    if not legal:
        return ()
    wins = tuple(action for action in legal if state.play(action).winner() == state.player)
    if wins:
        return wins
    opponent = ConnectFour(state.board, -state.player, state.ply)
    threats = tuple(
        action for action in legal if opponent.play(action).winner() == -state.player
    )
    return threats or legal
