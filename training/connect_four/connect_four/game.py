from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

ROWS = 6
COLS = 7
SIZE = ROWS * COLS
CENTER_FIRST = (3, 2, 4, 1, 5, 0, 6)


@dataclass(frozen=True, slots=True)
class ConnectFour:
    """Immutable Connect Four state.

    Board cells are 0 (empty), 1 (first player), or -1 (second player).
    ``player`` is the side to move.
    """

    board: tuple[int, ...] = (0,) * SIZE
    player: int = 1
    ply: int = 0

    def __post_init__(self) -> None:
        if len(self.board) != SIZE:
            raise ValueError(f"board must contain {SIZE} cells")
        if self.player not in (-1, 1):
            raise ValueError("player must be 1 or -1")

    @classmethod
    def from_moves(cls, moves: Iterable[int]) -> "ConnectFour":
        state = cls()
        for action in moves:
            state = state.play(action)
        return state

    def legal_actions(self) -> tuple[int, ...]:
        if self.is_terminal():
            return ()
        return tuple(column for column in CENTER_FIRST if self.board[column] == 0)

    def legal_mask(self) -> np.ndarray:
        mask = np.zeros(COLS, dtype=np.float32)
        for action in self.legal_actions():
            mask[action] = 1.0
        return mask

    def play(self, action: int) -> "ConnectFour":
        if action < 0 or action >= COLS:
            raise ValueError(f"column {action} is outside 0..{COLS - 1}")
        if self.is_terminal():
            raise ValueError("cannot play after the game has ended")
        if self.board[action] != 0:
            raise ValueError(f"column {action} is full")

        cells = list(self.board)
        for row in range(ROWS - 1, -1, -1):
            index = row * COLS + action
            if cells[index] == 0:
                cells[index] = self.player
                return ConnectFour(tuple(cells), -self.player, self.ply + 1)
        raise AssertionError("top-cell legality check and board contents disagree")

    def winner(self) -> int:
        board = self.board
        for row in range(ROWS):
            for col in range(COLS):
                player = board[row * COLS + col]
                if player == 0:
                    continue
                for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                    end_row, end_col = row + 3 * dr, col + 3 * dc
                    if not (0 <= end_row < ROWS and 0 <= end_col < COLS):
                        continue
                    if all(
                        board[(row + step * dr) * COLS + col + step * dc] == player
                        for step in range(1, 4)
                    ):
                        return player
        return 0

    def is_terminal(self) -> bool:
        return self.winner() != 0 or self.ply == SIZE

    def outcome(self, perspective: int | None = None) -> float:
        """Return terminal value from ``perspective``; raises before terminal."""
        if not self.is_terminal():
            raise ValueError("outcome is only defined for terminal states")
        winner = self.winner()
        if winner == 0:
            return 0.0
        side = self.player if perspective is None else perspective
        return 1.0 if winner == side else -1.0

    def encode(self) -> np.ndarray:
        """Encode from the side-to-move viewpoint as three 6x7 planes."""
        board = np.asarray(self.board, dtype=np.int8).reshape(ROWS, COLS)
        return np.stack(
            (
                board == self.player,
                board == -self.player,
                np.ones((ROWS, COLS), dtype=np.bool_),
            )
        ).astype(np.float32)

    def mirrored(self) -> "ConnectFour":
        board = np.asarray(self.board, dtype=np.int8).reshape(ROWS, COLS)
        return ConnectFour(tuple(board[:, ::-1].reshape(-1).tolist()), self.player, self.ply)

    @staticmethod
    def mirror_policy(policy: np.ndarray) -> np.ndarray:
        return np.asarray(policy, dtype=np.float32)[::-1].copy()

    def key(self) -> tuple[tuple[int, ...], int]:
        return self.board, self.player
