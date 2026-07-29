import unittest

import numpy as np

from morris.game import (
    ACTION_SIZE,
    ADJACENCY,
    CAPTURE_BASE,
    MAX_NO_CAPTURE_TURNS,
    MILLS,
    MOVEMENT_BASE,
    NineMensMorris,
    capture_action,
    decode_action,
    movement_action,
    placement_action,
)


def state_with(
    first=(),
    second=(),
    hand=(0, 0),
    player=1,
    removing=False,
    no_capture_turns=0,
) -> NineMensMorris:
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
        no_capture_turns=no_capture_turns,
    )


class MorrisRuleTests(unittest.TestCase):
    def test_board_definition_matches_web_game(self) -> None:
        self.assertEqual(len(ADJACENCY), 24)
        self.assertEqual(len(MILLS), 16)
        for source, neighbours in enumerate(ADJACENCY):
            for target in neighbours:
                self.assertIn(source, ADJACENCY[target])

    def test_action_ranges_and_round_trip(self) -> None:
        self.assertEqual(placement_action(23), 23)
        self.assertEqual(movement_action(0, 0), MOVEMENT_BASE)
        self.assertEqual(movement_action(23, 23), CAPTURE_BASE - 1)
        self.assertEqual(capture_action(0), CAPTURE_BASE)
        self.assertEqual(capture_action(23), ACTION_SIZE - 1)
        for action in range(ACTION_SIZE):
            decoded = decode_action(action)
            if decoded.kind == "place":
                rebuilt = placement_action(decoded.target)
            elif decoded.kind == "move":
                rebuilt = movement_action(decoded.source, decoded.target)
            else:
                rebuilt = capture_action(decoded.target)
            self.assertEqual(rebuilt, action)

    def test_opening_has_24_placement_actions_and_mask(self) -> None:
        state = NineMensMorris()
        self.assertEqual(state.legal_actions(), tuple(range(24)))
        mask = state.legal_mask()
        self.assertEqual(mask.shape, (ACTION_SIZE,))
        self.assertEqual(mask.dtype, np.float32)
        self.assertEqual(float(mask.sum()), 24.0)
        np.testing.assert_array_equal(np.flatnonzero(mask), np.arange(24))

    def test_forming_mill_enters_removal_state(self) -> None:
        state = state_with(first=(0, 1), second=(3, 4), hand=(7, 7), player=1)
        removal_state = state.play(placement_action(2))
        self.assertTrue(removal_state.removing)
        self.assertEqual(removal_state.player, 1)
        self.assertEqual(
            set(removal_state.legal_actions()),
            {capture_action(3), capture_action(4)},
        )

        child = removal_state.play(capture_action(3))
        self.assertFalse(child.removing)
        self.assertEqual(child.player, -1)
        self.assertEqual(child.board[3], 0)
        self.assertEqual(child.no_capture_turns, 0)

    def test_piece_outside_mill_must_be_captured_first(self) -> None:
        state = state_with(
            first=(0, 1, 2),
            second=(3, 4, 5, 9),
            hand=(6, 5),
            player=1,
            removing=True,
        )
        self.assertEqual(state.legal_actions(), (capture_action(9),))

    def test_mill_piece_can_be_captured_when_all_are_protected(self) -> None:
        state = state_with(
            first=(0, 1, 2),
            second=(3, 4, 5),
            hand=(6, 6),
            player=1,
            removing=True,
        )
        self.assertEqual(
            set(state.legal_actions()),
            {capture_action(3), capture_action(4), capture_action(5)},
        )

    def test_non_mill_action_finishes_turn(self) -> None:
        state = NineMensMorris()
        child = state.play(placement_action(0))
        self.assertFalse(child.removing)
        self.assertEqual(child.player, -1)
        self.assertEqual(child.hand, (8, 9))
        self.assertEqual(child.no_capture_turns, 0)

    def test_four_pieces_must_follow_lines(self) -> None:
        state = state_with(first=(0, 3, 6, 21), second=(2, 5, 8, 23), player=1)
        self.assertEqual(state.movement_targets(0), (1, 9))
        self.assertNotIn(movement_action(0, 14), state.legal_actions())

    def test_three_pieces_can_fly_to_any_empty_point(self) -> None:
        state = state_with(first=(0, 3, 6), second=(2, 5, 8, 23), player=1)
        empty = state.board.count(0)
        self.assertEqual(len(state.movement_targets(0)), empty)
        self.assertIn(movement_action(0, 14), state.legal_actions())

    def test_action_kind_must_match_phase(self) -> None:
        opening = NineMensMorris()
        with self.assertRaises(ValueError):
            opening.play(capture_action(0))
        with self.assertRaises(ValueError):
            opening.play(movement_action(0, 1))

        removing = state_with(
            first=(0, 1, 2),
            second=(3, 4),
            hand=(6, 7),
            player=1,
            removing=True,
        )
        with self.assertRaises(ValueError):
            removing.play(placement_action(5))

    def test_player_with_fewer_than_three_pieces_loses(self) -> None:
        state = state_with(first=(0, 1), second=(3, 4, 5), player=1)
        self.assertTrue(state.is_terminal())
        self.assertEqual(state.winner(), -1)
        self.assertEqual(state.outcome(1), -1.0)

    def test_immobilized_player_loses(self) -> None:
        state = state_with(
            first=(0, 2, 21, 23),
            second=(1, 9, 14, 22),
            player=1,
        )
        self.assertTrue(state.is_terminal())
        self.assertEqual(state.winner(), -1)

    def test_no_capture_limit_is_draw(self) -> None:
        state = state_with(
            first=(0, 3, 6),
            second=(2, 5, 8),
            player=1,
            no_capture_turns=MAX_NO_CAPTURE_TURNS,
        )
        self.assertTrue(state.is_draw())
        self.assertTrue(state.is_terminal())
        self.assertEqual(state.outcome(), 0.0)


if __name__ == "__main__":
    unittest.main()
