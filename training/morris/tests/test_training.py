import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

from morris.game import ACTION_SIZE, NineMensMorris
from morris.model import MorrisPolicyValueNet
from morris.replay import ReplayBuffer
from morris.selfplay import Sample
from morris.training import (
    TrainConfig,
    optimize,
    restore_checkpoint,
    run_training,
    save_checkpoint,
)


def training_sample(value: float = 0.0) -> Sample:
    state = NineMensMorris()
    policy = state.legal_mask()
    policy /= policy.sum()
    return Sample(state.encode(), policy.astype(np.float32), value)


class MorrisTrainingTests(unittest.TestCase):
    def test_optimizer_step_and_atomic_checkpoint(self) -> None:
        model = MorrisPolicyValueNet(channels=8, blocks=1)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        replay = ReplayBuffer(10)
        replay.extend(training_sample(value) for value in (-1, 0, 1, 0))
        config = TrainConfig(
            iterations=1,
            games_per_iteration=1,
            simulations=1,
            epochs=1,
            batch_size=4,
            channels=8,
            blocks=1,
            max_actions=4,
        )
        before = next(model.parameters()).detach().clone()
        metrics = optimize(model, optimizer, replay, config, torch.device("cpu"))
        after = next(model.parameters()).detach()
        self.assertFalse(torch.equal(before, after))
        self.assertTrue(np.isfinite(metrics["policy_loss"]))
        self.assertTrue(np.isfinite(metrics["value_loss"]))

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.pt"
            save_checkpoint(path, model, optimizer, 3, config)
            restored_model = MorrisPolicyValueNet(channels=8, blocks=1)
            restored_optimizer = torch.optim.AdamW(restored_model.parameters())
            iteration = restore_checkpoint(
                path,
                restored_model,
                restored_optimizer,
                torch.device("cpu"),
            )
            self.assertEqual(iteration, 3)
            for expected, actual in zip(
                model.parameters(),
                restored_model.parameters(),
            ):
                torch.testing.assert_close(expected, actual)

    def test_end_to_end_tiny_training_and_replay_restore(self) -> None:
        config = TrainConfig(
            iterations=1,
            games_per_iteration=1,
            simulations=1,
            epochs=1,
            batch_size=8,
            replay_size=100,
            channels=8,
            blocks=1,
            temperature_actions=2,
            max_actions=8,
            seed=17,
        )
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run"
            latest = run_training(config, output, "cpu")
            self.assertTrue(latest.exists())
            self.assertTrue((output / "replay.npz").exists())
            replay = ReplayBuffer.load(output / "replay.npz")
            self.assertEqual(len(replay), 8)

            resumed_config = TrainConfig(
                iterations=1,
                games_per_iteration=1,
                simulations=1,
                epochs=1,
                batch_size=8,
                replay_size=100,
                channels=8,
                blocks=1,
                temperature_actions=2,
                max_actions=4,
                seed=18,
            )
            resumed = run_training(
                resumed_config,
                output,
                "cpu",
                resume=latest,
            )
            saved = torch.load(resumed, map_location="cpu", weights_only=False)
            self.assertEqual(saved["iteration"], 2)
            self.assertEqual(len(ReplayBuffer.load(output / "replay.npz")), 12)


if __name__ == "__main__":
    unittest.main()
