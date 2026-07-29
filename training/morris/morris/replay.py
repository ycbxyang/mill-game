from __future__ import annotations

import os
import tempfile
from collections import deque
from pathlib import Path
from typing import Iterable, Iterator

import numpy as np

from .game import ACTION_SIZE, FEATURE_PLANES, POINTS
from .selfplay import Sample, validate_sample

REPLAY_VERSION = 1


class ReplayBuffer:
    """Bounded replay memory with atomic compressed persistence."""

    def __init__(self, capacity: int = 100_000) -> None:
        if capacity < 1:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._samples: deque[Sample] = deque(maxlen=capacity)

    def __len__(self) -> int:
        return len(self._samples)

    def __iter__(self) -> Iterator[Sample]:
        return iter(self._samples)

    def append(self, sample: Sample) -> None:
        validate_sample(sample)
        self._samples.append(
            Sample(
                state=np.asarray(sample.state, dtype=np.float32).copy(),
                policy=np.asarray(sample.policy, dtype=np.float32).copy(),
                value=float(sample.value),
            )
        )

    def extend(self, samples: Iterable[Sample]) -> None:
        for sample in samples:
            self.append(sample)

    def arrays(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self._samples:
            return (
                np.empty((0, FEATURE_PLANES, POINTS), dtype=np.float32),
                np.empty((0, ACTION_SIZE), dtype=np.float32),
                np.empty((0,), dtype=np.float32),
            )
        return (
            np.stack([sample.state for sample in self._samples]).astype(
                np.float32, copy=False
            ),
            np.stack([sample.policy for sample in self._samples]).astype(
                np.float32, copy=False
            ),
            np.asarray([sample.value for sample in self._samples], dtype=np.float32),
        )

    def sample_batch(
        self,
        batch_size: int,
        rng: np.random.Generator | None = None,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        if batch_size > len(self):
            raise ValueError("batch_size exceeds replay size")
        generator = np.random.default_rng() if rng is None else rng
        indices = generator.choice(len(self), size=batch_size, replace=False)
        states, policies, values = self.arrays()
        return states[indices], policies[indices], values[indices]

    def save(self, path: str | Path) -> Path:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        states, policies, values = self.arrays()
        temporary_name: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=destination.parent,
                prefix=f".{destination.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_name = temporary.name
                np.savez_compressed(
                    temporary,
                    version=np.asarray([REPLAY_VERSION], dtype=np.int32),
                    capacity=np.asarray([self.capacity], dtype=np.int64),
                    states=states,
                    policies=policies,
                    values=values,
                )
            os.replace(temporary_name, destination)
        except Exception:
            if temporary_name is not None:
                Path(temporary_name).unlink(missing_ok=True)
            raise
        return destination

    @classmethod
    def load(
        cls,
        path: str | Path,
        capacity: int | None = None,
    ) -> "ReplayBuffer":
        source = Path(path)
        with np.load(source, allow_pickle=False) as archive:
            version = int(archive["version"][0])
            stored_capacity = int(archive["capacity"][0])
            states = np.asarray(archive["states"], dtype=np.float32)
            policies = np.asarray(archive["policies"], dtype=np.float32)
            values = np.asarray(archive["values"], dtype=np.float32)

        if version != REPLAY_VERSION:
            raise ValueError(f"unsupported replay version {version}")
        if states.ndim != 3 or states.shape[1:] != (FEATURE_PLANES, POINTS):
            raise ValueError("replay states have invalid shape")
        if policies.ndim != 2 or policies.shape[1:] != (ACTION_SIZE,):
            raise ValueError("replay policies have invalid shape")
        if values.ndim != 1 or not (
            len(states) == len(policies) == len(values)
        ):
            raise ValueError("replay arrays have inconsistent lengths")

        target_capacity = stored_capacity if capacity is None else capacity
        buffer = cls(target_capacity)
        start = max(0, len(values) - target_capacity)
        for state, policy, value in zip(
            states[start:],
            policies[start:],
            values[start:],
        ):
            buffer.append(Sample(state, policy, float(value)))
        return buffer
