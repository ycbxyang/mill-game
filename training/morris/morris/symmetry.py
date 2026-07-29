from __future__ import annotations

import numpy as np
import torch

from .game import (
    ACTION_SIZE,
    NineMensMorris,
    capture_action,
    decode_action,
    movement_action,
    placement_action,
)

POINT_COORDINATES: tuple[tuple[int, int], ...] = (
    (-3, -3),
    (0, -3),
    (3, -3),
    (-2, -2),
    (0, -2),
    (2, -2),
    (-1, -1),
    (0, -1),
    (1, -1),
    (-3, 0),
    (-2, 0),
    (-1, 0),
    (1, 0),
    (2, 0),
    (3, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
    (-2, 2),
    (0, 2),
    (2, 2),
    (-3, 3),
    (0, 3),
    (3, 3),
)


def _point_permutations() -> tuple[tuple[int, ...], ...]:
    coordinate_to_point = {
        coordinate: point
        for point, coordinate in enumerate(POINT_COORDINATES)
    }

    def rotations(x: int, y: int) -> tuple[tuple[int, int], ...]:
        return (
            (x, y),
            (-y, x),
            (-x, -y),
            (y, -x),
            (-x, y),
            (-y, -x),
            (x, -y),
            (y, x),
        )

    permutations = []
    for symmetry in range(8):
        permutations.append(
            tuple(
                coordinate_to_point[rotations(x, y)[symmetry]]
                for x, y in POINT_COORDINATES
            )
        )
    return tuple(permutations)


POINT_PERMUTATIONS = _point_permutations()


def _action_permutations() -> tuple[tuple[int, ...], ...]:
    permutations: list[tuple[int, ...]] = []
    for point_permutation in POINT_PERMUTATIONS:
        actions: list[int] = []
        for action in range(ACTION_SIZE):
            decoded = decode_action(action)
            target = point_permutation[decoded.target]
            if decoded.kind == "place":
                transformed = placement_action(target)
            elif decoded.kind == "move":
                assert decoded.source is not None
                transformed = movement_action(
                    point_permutation[decoded.source],
                    target,
                )
            else:
                transformed = capture_action(target)
            actions.append(transformed)
        permutations.append(tuple(actions))
    return tuple(permutations)


ACTION_PERMUTATIONS = _action_permutations()
POINT_INVERSES = tuple(
    tuple(np.argsort(permutation).tolist())
    for permutation in POINT_PERMUTATIONS
)
ACTION_INVERSES = tuple(
    tuple(np.argsort(permutation).tolist())
    for permutation in ACTION_PERMUTATIONS
)


def transform_state(state: NineMensMorris, symmetry: int) -> NineMensMorris:
    permutation = POINT_PERMUTATIONS[symmetry]
    board = [0] * len(state.board)
    for source, target in enumerate(permutation):
        board[target] = state.board[source]
    return NineMensMorris(
        board=tuple(board),
        hand=state.hand,
        player=state.player,
        removing=state.removing,
        ply=state.ply,
        no_capture_turns=state.no_capture_turns,
    )


def transform_policy(policy: np.ndarray, symmetry: int) -> np.ndarray:
    if policy.shape != (ACTION_SIZE,):
        raise ValueError(f"policy must have shape ({ACTION_SIZE},)")
    transformed = np.empty_like(policy)
    transformed[np.asarray(ACTION_PERMUTATIONS[symmetry])] = policy
    return transformed


def inverse_tensors(device: torch.device) -> tuple[torch.Tensor, torch.Tensor]:
    return (
        torch.tensor(POINT_INVERSES, dtype=torch.long, device=device),
        torch.tensor(ACTION_INVERSES, dtype=torch.long, device=device),
    )


def augment_batch(
    states: torch.Tensor,
    policies: torch.Tensor,
    point_inverses: torch.Tensor,
    action_inverses: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    symmetries = torch.randint(
        len(POINT_PERMUTATIONS),
        (states.shape[0],),
        device=states.device,
    )
    point_indices = point_inverses[symmetries]
    action_indices = action_inverses[symmetries]
    transformed_states = states.gather(
        2,
        point_indices[:, None, :].expand(-1, states.shape[1], -1),
    )
    transformed_policies = policies.gather(1, action_indices)
    return transformed_states, transformed_policies
