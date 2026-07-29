import unittest

import numpy as np

from connect_four.game import ConnectFour
from connect_four.solver import EndgameSolver, tactical_actions, tactical_policy


class GameTests(unittest.TestCase):
    def test_vertical_win(self) -> None:
        state = ConnectFour.from_moves([0, 1, 0, 1, 0, 1, 0])
        self.assertTrue(state.is_terminal())
        self.assertEqual(state.winner(), 1)
        self.assertEqual(state.outcome(1), 1)
        self.assertEqual(state.outcome(-1), -1)

    def test_horizontal_win(self) -> None:
        state = ConnectFour.from_moves([0, 0, 1, 1, 2, 2, 3])
        self.assertEqual(state.winner(), 1)

    def test_diagonal_win(self) -> None:
        state = ConnectFour.from_moves(
            [4, 4, 5, 1, 6, 5, 1, 5, 6, 3, 1, 2, 0, 6, 1, 1, 0, 2, 4, 5, 0, 6]
        )
        self.assertEqual(state.winner(), -1)

    def test_full_column_is_illegal(self) -> None:
        state = ConnectFour.from_moves([0, 0, 0, 0, 0, 0])
        self.assertNotIn(0, state.legal_actions())
        with self.assertRaises(ValueError):
            state.play(0)

    def test_encoding_and_mirror(self) -> None:
        state = ConnectFour.from_moves([0, 6, 1])
        encoded = state.encode()
        self.assertEqual(encoded.shape, (3, 6, 7))
        np.testing.assert_array_equal(state.mirrored().mirrored().board, state.board)

    def test_tactical_teacher_chooses_win(self) -> None:
        state = ConnectFour.from_moves([0, 6, 1, 6, 2, 5])
        policy = tactical_policy(state)
        self.assertEqual(int(np.argmax(policy)), 3)
        self.assertAlmostEqual(sum(policy), 1.0)

    def test_tactical_actions_force_win(self) -> None:
        state = ConnectFour.from_moves([0, 6, 1, 6, 2, 5])
        self.assertEqual(tactical_actions(state), (3,))

    def test_tactical_actions_force_block(self) -> None:
        state = ConnectFour.from_moves([6, 0, 6, 1, 5, 2])
        self.assertEqual(tactical_actions(state), (3,))

    def test_exact_endgame_terminal(self) -> None:
        state = ConnectFour.from_moves([0, 1, 0, 1, 0, 1, 0])
        result = EndgameSolver().solve(state, max_empty=42)
        self.assertEqual(result.value, -1)
        self.assertEqual(result.best_actions, ())


if __name__ == "__main__":
    unittest.main()
