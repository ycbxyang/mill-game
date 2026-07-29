import unittest

import numpy as np
import torch

from morris.game import (
    ACTION_SIZE,
    FEATURE_PLANES,
    POINTS,
    NineMensMorris,
    placement_action,
)
from morris.model import MorrisPolicyValueNet, normalized_adjacency


class MorrisModelTests(unittest.TestCase):
    def test_encoding_shape_and_partition(self) -> None:
        state = NineMensMorris().play(placement_action(0))
        encoded = state.encode()
        self.assertEqual(encoded.shape, (FEATURE_PLANES, POINTS))
        self.assertEqual(encoded.dtype, np.float32)
        np.testing.assert_array_equal(
            encoded[0] + encoded[1] + encoded[2],
            np.ones(POINTS, dtype=np.float32),
        )
        self.assertEqual(encoded[1, 0], 1.0)
        self.assertTrue(np.all(encoded[8] == 1.0))
        self.assertTrue(np.all(encoded[9] == 0.0))

    def test_graph_adjacency_is_row_normalized(self) -> None:
        adjacency = normalized_adjacency()
        torch.testing.assert_close(adjacency.sum(dim=1), torch.ones(POINTS))
        self.assertEqual(float(adjacency[0, 1]), 0.5)
        self.assertEqual(float(adjacency[0, 9]), 0.5)
        self.assertEqual(float(adjacency[0, 2]), 0.0)

    def test_network_output_shapes_and_value_range(self) -> None:
        model = MorrisPolicyValueNet(channels=16, blocks=2)
        batch = torch.from_numpy(
            np.stack((NineMensMorris().encode(), NineMensMorris().encode()))
        )
        policy, value = model(batch)
        self.assertEqual(tuple(policy.shape), (2, ACTION_SIZE))
        self.assertEqual(tuple(value.shape), (2,))
        self.assertTrue(torch.all(value >= -1))
        self.assertTrue(torch.all(value <= 1))

    def test_legal_mask_can_mask_policy_logits(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1).eval()
        state = NineMensMorris()
        with torch.inference_mode():
            policy, _ = model(torch.from_numpy(state.encode()).unsqueeze(0))
        mask = torch.from_numpy(state.legal_mask()).bool()
        masked = policy[0].masked_fill(~mask, -torch.inf)
        self.assertTrue(torch.isfinite(masked[:24]).all())
        self.assertTrue(torch.isneginf(masked[24:]).all())

    def test_invalid_network_shape_is_rejected(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        with self.assertRaises(ValueError):
            model(torch.zeros(1, 3, 24))


if __name__ == "__main__":
    unittest.main()
