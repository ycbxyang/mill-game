import tempfile
import unittest
from collections import deque
from pathlib import Path

import numpy as np
import torch

from connect_four.game import ConnectFour
from connect_four.mcts import MCTS
from connect_four.model import PolicyValueNet
from connect_four.selfplay import Sample
from connect_four.training import TrainConfig, optimize, save_checkpoint


class PipelineTests(unittest.TestCase):
    def test_model_and_mcts(self) -> None:
        model = PolicyValueNet(channels=8, blocks=1)
        state = ConnectFour()
        logits, value = model(torch.from_numpy(state.encode()).unsqueeze(0))
        self.assertEqual(tuple(logits.shape), (1, 7))
        self.assertEqual(tuple(value.shape), (1,))
        policy = MCTS(model, torch.device("cpu"), simulations=4).search(
            state, add_noise=False
        )
        self.assertAlmostEqual(float(policy.sum()), 1.0, places=5)
        self.assertTrue(np.all(policy >= 0))

    def test_mcts_cannot_ignore_immediate_win_or_block(self) -> None:
        model = PolicyValueNet(channels=8, blocks=1)
        search = MCTS(model, torch.device("cpu"), simulations=2)
        winning = ConnectFour.from_moves([0, 6, 1, 6, 2, 5])
        blocking = ConnectFour.from_moves([6, 0, 6, 1, 5, 2])
        self.assertEqual(int(search.search(winning, add_noise=False).argmax()), 3)
        self.assertEqual(int(search.search(blocking, add_noise=False).argmax()), 3)

    def test_one_optimizer_step_and_checkpoint(self) -> None:
        model = PolicyValueNet(channels=8, blocks=1)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        state = ConnectFour()
        replay = deque(
            [Sample(state.encode(), np.full(7, 1 / 7, dtype=np.float32), 0.0)]
            * 4
        )
        config = TrainConfig(epochs=1, batch_size=4, channels=8, blocks=1)
        metrics = optimize(model, optimizer, replay, config, torch.device("cpu"))
        self.assertGreater(metrics["policy_loss"], 0)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.pt"
            save_checkpoint(path, model, optimizer, 1, config)
            self.assertTrue(path.exists())


if __name__ == "__main__":
    unittest.main()
