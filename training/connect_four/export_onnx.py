from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from connect_four.model import PolicyValueNet


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a checkpoint for ONNX Runtime Web")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--output", type=Path, default=Path("exports/connect-four.onnx"))
    args = parser.parse_args()

    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    architecture = saved.get("architecture", {"channels": 64, "blocks": 4})
    model = PolicyValueNet(**architecture)
    model.load_state_dict(saved["model"])
    model.eval()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    example = torch.zeros(1, 3, 6, 7)
    torch.onnx.export(
        model,
        example,
        args.output,
        input_names=["board"],
        output_names=["policy_logits", "value"],
        dynamic_axes={"board": {0: "batch"}, "policy_logits": {0: "batch"}, "value": {0: "batch"}},
        opset_version=18,
        dynamo=False,
    )

    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    expected = model(example)
    actual = session.run(None, {"board": example.numpy()})
    np.testing.assert_allclose(actual[0], expected[0].detach().numpy(), rtol=1e-4, atol=1e-5)
    np.testing.assert_allclose(actual[1], expected[1].detach().numpy(), rtol=1e-4, atol=1e-5)
    print(f"exported={args.output} bytes={args.output.stat().st_size}")


if __name__ == "__main__":
    main()
