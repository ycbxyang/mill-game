import random
import unittest

import numpy as np

from morris.game import NineMensMorris, capture_action
from morris.teacher import Teacher, heuristic_value, play_teacher_game


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


class MorrisTeacherTests(unittest.TestCase):
    def test_heuristic_prefers_material_advantage(self) -> None:
        ahead = state_with(
            first=(0, 3, 6, 9, 21),
            second=(2, 5, 8, 23),
            player=1,
        )
        behind = state_with(
            first=(0, 3, 6, 9),
            second=(2, 5, 8, 14, 23),
            player=1,
        )
        self.assertGreater(heuristic_value(ahead), heuristic_value(behind))

    def test_teacher_policy_is_legal_and_normalized(self) -> None:
        state = NineMensMorris()
        policy = Teacher(depth=1).policy(state)
        self.assertAlmostEqual(float(policy.sum()), 1.0, places=6)
        self.assertTrue(np.all(policy[:24] >= 0))
        self.assertTrue(np.all(policy[24:] == 0))

    def test_teacher_respects_removal_rules(self) -> None:
        state = state_with(
            first=(0, 1, 2),
            second=(3, 4, 5, 9),
            hand=(6, 5),
            player=1,
            removing=True,
        )
        policy = Teacher(depth=1).policy(state)
        self.assertEqual(set(np.flatnonzero(policy)), {capture_action(9)})

    def test_short_teacher_game_generates_samples(self) -> None:
        result = play_teacher_game(
            Teacher(depth=1),
            random.Random(11),
            epsilon=0.2,
            max_actions=8,
        )
        self.assertEqual(result.actions, 8)
        self.assertEqual(len(result.samples), 8)
        self.assertEqual(result.termination, "action_limit")
        for sample in result.samples:
            self.assertAlmostEqual(float(sample.policy.sum()), 1.0, places=5)


if __name__ == "__main__":
    unittest.main()
