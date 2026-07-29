import unittest

import numpy as np
import torch

from morris.game import ADJACENCY, MILLS, NineMensMorris
from morris.symmetry import (
    ACTION_PERMUTATIONS,
    POINT_PERMUTATIONS,
    augment_batch,
    inverse_tensors,
    transform_policy,
    transform_state,
)


class MorrisSymmetryTests(unittest.TestCase):
    def test_point_and_action_permutations_are_bijections(self) -> None:
        for permutation in POINT_PERMUTATIONS:
            self.assertEqual(set(permutation), set(range(24)))
        for permutation in ACTION_PERMUTATIONS:
            self.assertEqual(set(permutation), set(range(624)))

    def test_symmetries_preserve_graph_and_mills(self) -> None:
        mills = {frozenset(mill) for mill in MILLS}
        for permutation in POINT_PERMUTATIONS:
            for source, neighbours in enumerate(ADJACENCY):
                mapped_neighbours = {
                    permutation[target] for target in neighbours
                }
                self.assertEqual(
                    mapped_neighbours,
                    set(ADJACENCY[permutation[source]]),
                )
            self.assertEqual(
                {
                    frozenset(permutation[point] for point in mill)
                    for mill in MILLS
                },
                mills,
            )

    def test_transformed_legal_policy_matches_transformed_state(self) -> None:
        state = NineMensMorris().play(0).play(4).play(1).play(5)
        policy = state.legal_mask()
        policy /= policy.sum()
        for symmetry in range(8):
            transformed_state = transform_state(state, symmetry)
            transformed_policy = transform_policy(policy, symmetry)
            np.testing.assert_array_equal(
                transformed_policy > 0,
                transformed_state.legal_mask() > 0,
            )
            self.assertAlmostEqual(float(transformed_policy.sum()), 1.0)

    def test_batch_augmentation_preserves_shapes_and_probability(self) -> None:
        state = NineMensMorris()
        states = torch.from_numpy(np.stack([state.encode()] * 16))
        policy = state.legal_mask()
        policy /= policy.sum()
        policies = torch.from_numpy(np.stack([policy] * 16))
        transformed_states, transformed_policies = augment_batch(
            states,
            policies,
            *inverse_tensors(torch.device("cpu")),
        )
        self.assertEqual(transformed_states.shape, states.shape)
        self.assertEqual(transformed_policies.shape, policies.shape)
        torch.testing.assert_close(
            transformed_policies.sum(dim=1),
            torch.ones(16),
        )


if __name__ == "__main__":
    unittest.main()
