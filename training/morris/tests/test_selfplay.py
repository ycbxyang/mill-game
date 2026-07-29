import unittest

import numpy as np
import torch

from morris.game import ACTION_SIZE, NineMensMorris, capture_action, placement_action
from morris.model import MorrisPolicyValueNet
from morris.selfplay import (
    Sample,
    finalize_samples,
    play_game,
    play_games_batched,
    validate_sample,
)


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


class MorrisSelfPlayTests(unittest.TestCase):
    def test_repetition_key_ignores_draw_counter(self) -> None:
        state = state_with(first=(0, 3, 6), second=(2, 5, 8))
        later = NineMensMorris(
            state.board,
            state.hand,
            state.player,
            state.removing,
            state.ply + 20,
            state.no_capture_turns + 20,
        )
        self.assertNotEqual(state.key(), later.key())
        self.assertEqual(state.position_key(), later.position_key())

    def test_value_labels_use_player_at_each_atomic_state(self) -> None:
        policy = np.zeros(ACTION_SIZE, dtype=np.float32)
        policy[placement_action(2)] = 1.0
        before_mill = state_with(
            first=(0, 1),
            second=(3, 4),
            hand=(7, 7),
            player=1,
        )
        removing = before_mill.play(placement_action(2))
        self.assertTrue(removing.removing)
        self.assertEqual(removing.player, before_mill.player)

        capture_policy = np.zeros(ACTION_SIZE, dtype=np.float32)
        capture_policy[capture_action(3)] = 1.0
        opponent_state = removing.play(capture_action(3))
        self.assertEqual(opponent_state.player, -1)
        labels = finalize_samples(
            [
                (before_mill, policy),
                (removing, capture_policy),
                (opponent_state, policy),
            ],
            winner=1,
        )
        self.assertEqual([sample.value for sample in labels], [1.0, 1.0, -1.0])

    def test_sample_validation(self) -> None:
        state = NineMensMorris()
        policy = state.legal_mask()
        policy /= policy.sum()
        validate_sample(Sample(state.encode(), policy, 0.0))
        with self.assertRaises(ValueError):
            validate_sample(Sample(state.encode(), np.zeros(ACTION_SIZE), 0.0))

    def test_short_self_play_smoke(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        result = play_game(
            model,
            torch.device("cpu"),
            simulations=2,
            temperature_actions=4,
            max_actions=12,
        )
        self.assertEqual(result.actions, 12)
        self.assertEqual(result.termination, "action_limit")
        self.assertEqual(result.winner, 0)
        self.assertEqual(len(result.samples), result.actions)
        for sample in result.samples:
            validate_sample(sample)

    def test_batched_self_play_returns_all_games(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        results = play_games_batched(
            model,
            torch.device("cpu"),
            simulations=1,
            games=3,
            temperature_actions=2,
            max_actions=4,
        )
        self.assertEqual(len(results), 3)
        for result in results:
            self.assertEqual(result.actions, 4)
            self.assertEqual(result.termination, "action_limit")
            for sample in result.samples:
                validate_sample(sample)


if __name__ == "__main__":
    unittest.main()
