from __future__ import annotations

from dataclasses import dataclass

import numpy as np

POINTS = 24
MEN_PER_PLAYER = 9
ACTION_SIZE = 624
MOVEMENT_BASE = 24
CAPTURE_BASE = 600
MAX_NO_CAPTURE_TURNS = 100
FEATURE_PLANES = 13

ADJACENCY: tuple[tuple[int, ...], ...] = (
    (1, 9),
    (0, 2, 4),
    (1, 14),
    (4, 10),
    (1, 3, 5, 7),
    (4, 13),
    (7, 11),
    (4, 6, 8),
    (7, 12),
    (0, 10, 21),
    (3, 9, 11, 18),
    (6, 10, 15),
    (8, 13, 17),
    (5, 12, 14, 20),
    (2, 13, 23),
    (11, 16),
    (15, 17, 19),
    (12, 16),
    (10, 19),
    (16, 18, 20, 22),
    (13, 19),
    (9, 22),
    (19, 21, 23),
    (14, 22),
)

MILLS: tuple[tuple[int, int, int], ...] = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (9, 10, 11),
    (12, 13, 14),
    (15, 16, 17),
    (18, 19, 20),
    (21, 22, 23),
    (0, 9, 21),
    (3, 10, 18),
    (6, 11, 15),
    (1, 4, 7),
    (16, 19, 22),
    (8, 12, 17),
    (5, 13, 20),
    (2, 14, 23),
)

MILLS_BY_POINT: tuple[tuple[tuple[int, int, int], ...], ...] = tuple(
    tuple(mill for mill in MILLS if point in mill) for point in range(POINTS)
)


def _player_index(player: int) -> int:
    if player == 1:
        return 0
    if player == -1:
        return 1
    raise ValueError("player must be 1 or -1")


def placement_action(target: int) -> int:
    _validate_point(target, "target")
    return target


def movement_action(source: int, target: int) -> int:
    _validate_point(source, "source")
    _validate_point(target, "target")
    return MOVEMENT_BASE + source * POINTS + target


def capture_action(point: int) -> int:
    _validate_point(point, "capture")
    return CAPTURE_BASE + point


def _validate_point(point: int, name: str) -> None:
    if not 0 <= point < POINTS:
        raise ValueError(f"{name} must be a board point from 0 to 23")


@dataclass(frozen=True, slots=True)
class DecodedAction:
    kind: str
    source: int | None
    target: int


def decode_action(action: int) -> DecodedAction:
    if not 0 <= action < ACTION_SIZE:
        raise ValueError(f"action must be from 0 to {ACTION_SIZE - 1}")
    if action < MOVEMENT_BASE:
        return DecodedAction("place", None, action)
    if action < CAPTURE_BASE:
        offset = action - MOVEMENT_BASE
        return DecodedAction("move", offset // POINTS, offset % POINTS)
    return DecodedAction("capture", None, action - CAPTURE_BASE)


@dataclass(frozen=True, slots=True)
class NineMensMorris:
    """Immutable atomic-action state.

    Board values are 0 (empty), 1 (first player), and -1 (second player).
    Closing a mill creates a state with ``removing=True``. The same player then
    chooses one capture action before the turn changes, matching the web UI.
    """

    board: tuple[int, ...] = (0,) * POINTS
    hand: tuple[int, int] = (MEN_PER_PLAYER, MEN_PER_PLAYER)
    player: int = 1
    removing: bool = False
    ply: int = 0
    no_capture_turns: int = 0

    def __post_init__(self) -> None:
        if len(self.board) != POINTS:
            raise ValueError(f"board must contain {POINTS} points")
        if any(value not in (-1, 0, 1) for value in self.board):
            raise ValueError("board values must be -1, 0, or 1")
        if self.player not in (-1, 1):
            raise ValueError("player must be 1 or -1")
        if len(self.hand) != 2 or any(not 0 <= value <= MEN_PER_PLAYER for value in self.hand):
            raise ValueError("hand counts must each be between 0 and 9")
        if self.ply < 0 or self.no_capture_turns < 0:
            raise ValueError("move counters cannot be negative")
        if self.removing and not self.removable_pieces(-self.player):
            raise ValueError("removing state requires an opposing piece to capture")

    def hand_count(self, player: int) -> int:
        return self.hand[_player_index(player)]

    def pieces(self, player: int) -> tuple[int, ...]:
        return tuple(index for index, value in enumerate(self.board) if value == player)

    def piece_count(self, player: int) -> int:
        return self.board.count(player)

    def is_placing(self, player: int | None = None) -> bool:
        side = self.player if player is None else player
        return self.hand_count(side) > 0

    def in_mill(
        self,
        point: int,
        player: int,
        board: tuple[int, ...] | None = None,
    ) -> bool:
        cells = self.board if board is None else board
        return any(all(cells[index] == player for index in mill) for mill in MILLS_BY_POINT[point])

    def removable_pieces(
        self,
        player: int,
        board: tuple[int, ...] | None = None,
    ) -> tuple[int, ...]:
        cells = self.board if board is None else board
        pieces = tuple(index for index, value in enumerate(cells) if value == player)
        outside = tuple(index for index in pieces if not self.in_mill(index, player, cells))
        return outside or pieces

    def movement_targets(self, source: int, player: int | None = None) -> tuple[int, ...]:
        side = self.player if player is None else player
        if self.board[source] != side:
            return ()
        empty = tuple(index for index, value in enumerate(self.board) if value == 0)
        if self.hand_count(side) == 0 and self.piece_count(side) == 3:
            return empty
        return tuple(index for index in ADJACENCY[source] if self.board[index] == 0)

    def _base_actions(self) -> tuple[int, ...]:
        if self.is_placing():
            return tuple(
                placement_action(target)
                for target, value in enumerate(self.board)
                if value == 0
            )
        return tuple(
            movement_action(source, target)
            for source in self.pieces(self.player)
            for target in self.movement_targets(source)
        )

    def legal_actions(self) -> tuple[int, ...]:
        if self.is_terminal():
            return ()
        if self.removing:
            return tuple(capture_action(point) for point in self.removable_pieces(-self.player))
        return self._base_actions()

    def legal_mask(self) -> np.ndarray:
        mask = np.zeros(ACTION_SIZE, dtype=np.float32)
        mask[list(self.legal_actions())] = 1.0
        return mask

    def encode(self) -> np.ndarray:
        """Encode 13 feature planes from the side-to-move viewpoint."""
        board = np.asarray(self.board, dtype=np.int8)
        own = board == self.player
        opponent = board == -self.player
        own_mills = np.asarray(
            [
                value and self.in_mill(point, self.player)
                for point, value in enumerate(own)
            ],
            dtype=np.float32,
        )
        opponent_mills = np.asarray(
            [
                value and self.in_mill(point, -self.player)
                for point, value in enumerate(opponent)
            ],
            dtype=np.float32,
        )
        degree = np.asarray([len(neighbours) / 4.0 for neighbours in ADJACENCY])
        own_hand = self.hand_count(self.player) / MEN_PER_PLAYER
        opponent_hand = self.hand_count(-self.player) / MEN_PER_PLAYER
        own_flying = self.hand_count(self.player) == 0 and self.piece_count(self.player) == 3
        opponent_flying = (
            self.hand_count(-self.player) == 0 and self.piece_count(-self.player) == 3
        )

        def constant(value: float | bool) -> np.ndarray:
            return np.full(POINTS, float(value), dtype=np.float32)

        encoded = np.stack(
            (
                own.astype(np.float32),
                opponent.astype(np.float32),
                (board == 0).astype(np.float32),
                own_mills,
                opponent_mills,
                degree.astype(np.float32),
                constant(own_hand),
                constant(opponent_hand),
                constant(self.is_placing()),
                constant(self.removing),
                constant(own_flying),
                constant(opponent_flying),
                constant(min(self.no_capture_turns / MAX_NO_CAPTURE_TURNS, 1.0)),
            )
        )
        if encoded.shape != (FEATURE_PLANES, POINTS):
            raise AssertionError("unexpected Morris feature shape")
        return encoded

    def play(self, action: int) -> "NineMensMorris":
        if action not in self.legal_actions():
            raise ValueError(f"illegal action: {action}")
        decoded = decode_action(action)
        cells = list(self.board)
        hand = list(self.hand)

        if decoded.kind == "capture":
            cells[decoded.target] = 0
            return NineMensMorris(
                board=tuple(cells),
                hand=self.hand,
                player=-self.player,
                removing=False,
                ply=self.ply + 1,
                no_capture_turns=0,
            )

        if decoded.kind == "place":
            hand[_player_index(self.player)] -= 1
        else:
            assert decoded.source is not None
            cells[decoded.source] = 0
        cells[decoded.target] = self.player
        board = tuple(cells)

        formed_mill = self.in_mill(decoded.target, self.player, board)
        can_capture = bool(self.removable_pieces(-self.player, board))
        if formed_mill and can_capture:
            return NineMensMorris(
                board=board,
                hand=tuple(hand),
                player=self.player,
                removing=True,
                ply=self.ply + 1,
                no_capture_turns=self.no_capture_turns,
            )

        next_no_capture = self.no_capture_turns + 1 if sum(hand) == 0 else 0
        return NineMensMorris(
            board=board,
            hand=tuple(hand),
            player=-self.player,
            removing=False,
            ply=self.ply + 1,
            no_capture_turns=next_no_capture,
        )

    def winner(self) -> int:
        if self.removing or sum(self.hand) > 0 or self.is_draw():
            return 0
        if self.piece_count(self.player) < 3 or not self._base_actions():
            return -self.player
        return 0

    def is_draw(self) -> bool:
        return self.no_capture_turns >= MAX_NO_CAPTURE_TURNS

    def is_terminal(self) -> bool:
        return self.is_draw() or self.winner() != 0

    def outcome(self, perspective: int | None = None) -> float:
        if not self.is_terminal():
            raise ValueError("outcome is only defined for terminal states")
        winner = self.winner()
        if winner == 0:
            return 0.0
        side = self.player if perspective is None else perspective
        return 1.0 if winner == side else -1.0

    def key(self) -> tuple[tuple[int, ...], tuple[int, int], int, bool, int]:
        return self.board, self.hand, self.player, self.removing, self.no_capture_turns

    def position_key(self) -> tuple[tuple[int, ...], tuple[int, int], int, bool]:
        """Position identity used for repetition detection."""
        return self.board, self.hand, self.player, self.removing
