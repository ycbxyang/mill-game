import tempfile
import unittest
from pathlib import Path

import numpy as np

from morris.game import ACTION_SIZE, NineMensMorris
from morris.replay import ReplayBuffer
from morris.selfplay import Sample


def sample(value: float, action: int = 0) -> Sample:
    state = NineMensMorris()
    policy = np.zeros(ACTION_SIZE, dtype=np.float32)
    policy[action] = 1.0
    return Sample(state.encode(), policy, value)


class MorrisReplayTests(unittest.TestCase):
    def test_capacity_discards_oldest_samples(self) -> None:
        replay = ReplayBuffer(capacity=3)
        replay.extend((sample(-1), sample(0), sample(1), sample(-1)))
        self.assertEqual(len(replay), 3)
        self.assertEqual([item.value for item in replay], [0.0, 1.0, -1.0])

    def test_arrays_and_deterministic_batch(self) -> None:
        replay = ReplayBuffer(capacity=10)
        replay.extend(sample(float(value), value + 1) for value in (-1, 0, 1))
        states, policies, values = replay.arrays()
        self.assertEqual(states.shape, (3, 13, 24))
        self.assertEqual(policies.shape, (3, ACTION_SIZE))
        np.testing.assert_array_equal(values, (-1, 0, 1))

        first = replay.sample_batch(2, np.random.default_rng(7))
        second = replay.sample_batch(2, np.random.default_rng(7))
        for left, right in zip(first, second):
            np.testing.assert_array_equal(left, right)

    def test_save_load_round_trip_and_capacity_override(self) -> None:
        replay = ReplayBuffer(capacity=5)
        replay.extend((sample(-1, 1), sample(0, 2), sample(1, 3)))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "replay.npz"
            replay.save(path)
            self.assertTrue(path.exists())

            restored = ReplayBuffer.load(path)
            self.assertEqual(restored.capacity, 5)
            self.assertEqual(len(restored), 3)
            left = replay.arrays()
            right = restored.arrays()
            for expected, actual in zip(left, right):
                np.testing.assert_array_equal(expected, actual)

            smaller = ReplayBuffer.load(path, capacity=2)
            self.assertEqual(len(smaller), 2)
            self.assertEqual([item.value for item in smaller], [0.0, 1.0])

    def test_empty_buffer_can_be_persisted(self) -> None:
        replay = ReplayBuffer(capacity=4)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.npz"
            replay.save(path)
            restored = ReplayBuffer.load(path)
            self.assertEqual(len(restored), 0)
            self.assertEqual(restored.capacity, 4)

    def test_invalid_sample_is_rejected(self) -> None:
        replay = ReplayBuffer()
        with self.assertRaises(ValueError):
            replay.append(
                Sample(
                    NineMensMorris().encode(),
                    np.zeros(ACTION_SIZE, dtype=np.float32),
                    0.0,
                )
            )


if __name__ == "__main__":
    unittest.main()
