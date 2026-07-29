from __future__ import annotations

import torch
from torch import nn

from .game import ACTION_SIZE, ADJACENCY, FEATURE_PLANES, POINTS


def normalized_adjacency() -> torch.Tensor:
    matrix = torch.zeros(POINTS, POINTS, dtype=torch.float32)
    for point, neighbours in enumerate(ADJACENCY):
        weight = 1.0 / len(neighbours)
        for neighbour in neighbours:
            matrix[point, neighbour] = weight
    return matrix


class GraphConv(nn.Module):
    """Combine a point's features with the mean of its graph neighbours."""

    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.self_path = nn.Conv1d(in_channels, out_channels, 1, bias=False)
        self.neighbour_path = nn.Conv1d(in_channels, out_channels, 1, bias=False)
        self.register_buffer("adjacency", normalized_adjacency(), persistent=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        neighbours = torch.matmul(x, self.adjacency.transpose(0, 1))
        return self.self_path(x) + self.neighbour_path(neighbours)


class GraphResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.graph1 = GraphConv(channels, channels)
        self.bn1 = nn.BatchNorm1d(channels)
        self.graph2 = GraphConv(channels, channels)
        self.bn2 = nn.BatchNorm1d(channels)
        self.activation = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        x = self.activation(self.bn1(self.graph1(x)))
        x = self.bn2(self.graph2(x))
        return self.activation(x + residual)


class MorrisPolicyValueNet(nn.Module):
    """Small graph-residual policy/value network for the 24-point board."""

    def __init__(self, channels: int = 64, blocks: int = 4) -> None:
        super().__init__()
        self.channels = channels
        self.blocks = blocks
        self.stem = nn.Sequential(
            GraphConv(FEATURE_PLANES, channels),
            nn.BatchNorm1d(channels),
            nn.ReLU(inplace=True),
        )
        self.tower = nn.Sequential(
            *(GraphResidualBlock(channels) for _ in range(blocks))
        )
        self.policy_head = nn.Sequential(
            nn.Conv1d(channels, 8, 1, bias=False),
            nn.BatchNorm1d(8),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(8 * POINTS, ACTION_SIZE),
        )
        self.value_head = nn.Sequential(
            nn.Conv1d(channels, 4, 1, bias=False),
            nn.BatchNorm1d(4),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(4 * POINTS, channels),
            nn.ReLU(inplace=True),
            nn.Linear(channels, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        if x.ndim != 3 or x.shape[1:] != (FEATURE_PLANES, POINTS):
            raise ValueError(
                f"expected input [batch, {FEATURE_PLANES}, {POINTS}], got {tuple(x.shape)}"
            )
        features = self.tower(self.stem(x))
        policy_logits = self.policy_head(features)
        value = self.value_head(features).squeeze(-1)
        return policy_logits, value
