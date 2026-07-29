import random
import unittest

from morris.arena import play_match, random_opening
from morris.game import NineMensMorris


class FirstLegalAgent:
    def select_action(self, state: NineMensMorris) -> int:
        return state.legal_actions()[0]


class IllegalAgent:
    def select_action(self, state: NineMensMorris) -> int:
        return 623


class MorrisArenaTests(unittest.TestCase):
    def test_random_opening_is_reproducible(self) -> None:
        first, first_repetitions = random_opening(random.Random(7), 4)
        second, second_repetitions = random_opening(random.Random(7), 4)
        self.assertEqual(first, second)
        self.assertEqual(first_repetitions, second_repetitions)

    def test_short_match_reaches_action_limit(self) -> None:
        result = play_match(
            FirstLegalAgent(),
            FirstLegalAgent(),
            max_actions=4,
        )
        self.assertEqual(result.winner, 0)
        self.assertEqual(result.actions, 4)
        self.assertEqual(result.termination, "action_limit")

    def test_illegal_agent_action_is_rejected(self) -> None:
        with self.assertRaises(RuntimeError):
            play_match(IllegalAgent(), FirstLegalAgent(), max_actions=1)


if __name__ == "__main__":
    unittest.main()
