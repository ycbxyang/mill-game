"""Nine Men's Morris neural-network training package."""

from .game import (
    ACTION_SIZE,
    ADJACENCY,
    FEATURE_PLANES,
    MILLS,
    DecodedAction,
    NineMensMorris,
    capture_action,
    decode_action,
    movement_action,
    placement_action,
)

__all__ = [
    "ACTION_SIZE",
    "ADJACENCY",
    "FEATURE_PLANES",
    "MILLS",
    "DecodedAction",
    "NineMensMorris",
    "capture_action",
    "decode_action",
    "movement_action",
    "placement_action",
]
