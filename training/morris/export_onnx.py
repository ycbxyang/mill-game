from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from morris.game import NineMensMorris
from morris.model import MorrisPolicyValueNet


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export and verify the accepted Morris network as ONNX"
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("checkpoints/selfplay-symmetry/latest.pt"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../../games/morris/models/morris-expert.onnx"),
    )
    return parser.parse_args()


def validation_states() -> np.ndarray:
    state = NineMensMorris()
    states = [state.encode()]
    for action in (0, 4, 1, 5, 2, 3):
        state = state.play(action)
        states.append(state.encode())
        if state.removing:
            state = state.play(state.legal_actions()[0])
            states.append(state.encode())
    return np.stack(states).astype(np.float32)


def main() -> None:
    args = parse_args()
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    architecture = saved["architecture"]
    model = MorrisPolicyValueNet(
        architecture["channels"],
        architecture["blocks"],
    )
    model.load_state_dict(saved["model"])
    model.eval()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    dummy = torch.zeros(1, 13, 24, dtype=torch.float32)
    torch.onnx.export(
        model,
        (dummy,),
        args.output,
        input_names=["state"],
        output_names=["policy_logits", "value"],
        dynamic_axes={
            "state": {0: "batch"},
            "policy_logits": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    graph = onnx.load(args.output)
    metadata = {
        "game": "nine-mens-morris",
        "format_version": "1",
        "feature_planes": "13",
        "points": "24",
        "action_size": "624",
        "channels": str(architecture["channels"]),
        "blocks": str(architecture["blocks"]),
        "checkpoint_iteration": str(saved["iteration"]),
    }
    del graph.metadata_props[:]
    for key, value in metadata.items():
        entry = graph.metadata_props.add()
        entry.key = key
        entry.value = value
    onnx.checker.check_model(graph)
    onnx.save(graph, args.output)

    states = validation_states()
    with torch.inference_mode():
        expected_logits, expected_values = model(torch.from_numpy(states))
    session = ort.InferenceSession(
        str(args.output),
        providers=["CPUExecutionProvider"],
    )
    actual_logits, actual_values = session.run(None, {"state": states})
    policy_error = float(
        np.max(np.abs(actual_logits - expected_logits.numpy()))
    )
    value_error = float(
        np.max(np.abs(actual_values - expected_values.numpy()))
    )
    if policy_error > 1e-4 or value_error > 1e-5:
        raise RuntimeError(
            f"ONNX verification failed: policy={policy_error} value={value_error}"
        )
    print(
        f"complete output={args.output} bytes={args.output.stat().st_size} "
        f"states={len(states)} policy_max_error={policy_error:.8f} "
        f"value_max_error={value_error:.8f}",
        flush=True,
    )


if __name__ == "__main__":
    main()
