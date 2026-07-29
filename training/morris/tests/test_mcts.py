import unittest

import numpy as np
import torch

from morris.game import (
    ACTION_SIZE,
    NineMensMorris,
    capture_action,
    placement_action,
)
from morris.mcts import MCTS, Node, sample_action
from morris.model import MorrisPolicyValueNet


def state_with(first=(), second=(), hand=(0, 0), player=1, removing=False):
    board = [0] * 24
    for point in first:
        board[point] = 1
    for point in second:
        board[point] = -1
    return NineMensMorris(
        tuple(board),
        hand=hand,
        player=player,
        removing=removing,
    )


class MorrisMCTSTests(unittest.TestCase):
    def test_search_returns_only_legal_opening_policy(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        state = NineMensMorris()
        policy = MCTS(model, torch.device("cpu"), simulations=8).search(
            state,
            add_noise=False,
        )
        self.assertEqual(policy.shape, (ACTION_SIZE,))
        self.assertAlmostEqual(float(policy.sum()), 1.0, places=6)
        self.assertTrue(np.all(policy[:24] >= 0))
        self.assertTrue(np.all(policy[24:] == 0))

    def test_search_in_removal_state_only_selects_captures(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        state = state_with(
            first=(0, 1, 2),
            second=(3, 4),
            hand=(6, 7),
            player=1,
            removing=True,
        )
        policy = MCTS(model, torch.device("cpu"), simulations=4).search(
            state,
            add_noise=False,
        )
        nonzero = set(np.flatnonzero(policy))
        self.assertTrue(nonzero)
        self.assertLessEqual(nonzero, {capture_action(3), capture_action(4)})

    def test_batched_search_returns_one_legal_policy_per_state(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        states = [
            NineMensMorris(),
            NineMensMorris().play(placement_action(0)),
        ]
        policies = MCTS(
            model,
            torch.device("cpu"),
            simulations=4,
        ).search_many(states, add_noise=False)
        self.assertEqual(policies.shape, (2, ACTION_SIZE))
        for state, policy in zip(states, policies):
            self.assertAlmostEqual(float(policy.sum()), 1.0, places=6)
            self.assertTrue(np.all(policy[state.legal_mask() == 0] == 0))

    def test_batched_evaluation_matches_single_evaluation(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        model.eval()
        search = MCTS(model, torch.device("cpu"), simulations=1)
        states = [
            NineMensMorris(),
            NineMensMorris().play(placement_action(0)),
        ]
        policies, values = search.evaluate_many(states)
        for index, state in enumerate(states):
            policy, value = search.evaluate(state)
            np.testing.assert_allclose(policies[index], policy, atol=1e-6)
            self.assertAlmostEqual(float(values[index]), value, places=6)

    def test_backpropagation_does_not_flip_on_entering_removal(self) -> None:
        root = Node()
        removal = Node()
        place = placement_action(2)
        capture = capture_action(3)
        path = [
            (root, place, False),
            (removal, capture, True),
        ]
        MCTS.backpropagate(path, 0.75)
        self.assertAlmostEqual(float(removal.value_sum[capture]), -0.75)
        self.assertAlmostEqual(float(root.value_sum[place]), -0.75)

    def test_backpropagation_flips_for_each_player_change(self) -> None:
        root = Node()
        child = Node()
        MCTS.backpropagate(
            [(root, 0, True), (child, 1, True)],
            0.5,
        )
        self.assertAlmostEqual(float(child.value_sum[1]), -0.5)
        self.assertAlmostEqual(float(root.value_sum[0]), 0.5)

    def test_sampling_never_selects_zero_probability_action(self) -> None:
        policy = np.zeros(ACTION_SIZE, dtype=np.float32)
        policy[[2, 7]] = (0.25, 0.75)
        for _ in range(30):
            self.assertIn(sample_action(policy, temperature=1.0), (2, 7))
        self.assertEqual(sample_action(policy, temperature=0.0), 7)


if __name__ == "__main__":
    unittest.main()
