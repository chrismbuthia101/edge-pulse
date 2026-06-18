from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import numpy as np

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

_LITERT_BACKEND: str = "none"
_CompiledModel: Optional[Any] = None
_Interpreter: Optional[Any] = None

try:
    from ai_edge_litert.interpreter import Interpreter as _Interpreter  # type: ignore[import]

    _LITERT_BACKEND = "ai_edge_litert_interpreter"
    logger.debug("LiteRT: using ai_edge_litert.interpreter")
except ImportError:
    pass

try:
    from ai_edge_litert.compiled_model import CompiledModel as _CompiledModel  # type: ignore[import]

    _LITERT_BACKEND = "ai_edge_litert_compiled"
    logger.debug("LiteRT: using ai_edge_litert.compiled_model (CompiledModel API)")
except ImportError:
    pass

if _LITERT_BACKEND == "none":
    try:
        import tensorflow as _tf  # type: ignore[import]

        _Interpreter = _tf.lite.Interpreter  # type: ignore[assignment]
        _LITERT_BACKEND = "tensorflow"
        logger.debug("LiteRT: using tensorflow.lite.Interpreter (full TF)")
    except ImportError:
        pass

LITERT_AVAILABLE: bool = _LITERT_BACKEND != "none"
COMPILED_MODEL_AVAILABLE: bool = _CompiledModel is not None


class LiteRTBackend:

    def __init__(
        self,
        model_path: str,
        signature_index: int = 0,
    ) -> None:
        self._model_path = str(model_path)
        self._sig_idx = signature_index
        self._compiled: Optional[Any] = None
        self._interp: Optional[Any] = None
        self._input_details: Optional[list] = None
        self._output_details: Optional[list] = None

        if not Path(self._model_path).exists():
            raise FileNotFoundError(f"Model file not found: {self._model_path}")

        if not LITERT_AVAILABLE:
            raise RuntimeError(
                "No LiteRT/TFLite runtime found. " "Install: pip install ai-edge-litert"
            )

        if COMPILED_MODEL_AVAILABLE:
            self._compiled = _CompiledModel.from_file(self._model_path)  # type: ignore[misc]
            logger.info(
                "LiteRTBackend: loaded %s via CompiledModel API",
                Path(model_path).name,
            )
        else:
            if _Interpreter is None:
                raise RuntimeError("Interpreter API not available for LiteRT backend")
            interpreter: Any = _Interpreter(model_path)
            interpreter.allocate_tensors()
            self._input_details = interpreter.get_input_details()
            self._output_details = interpreter.get_output_details()
            self._interp = interpreter
            logger.info(
                "LiteRTBackend: loaded %s via Interpreter API (%s)",
                Path(model_path).name,
                _LITERT_BACKEND,
            )

    @classmethod
    def from_file(cls, model_path: str) -> "LiteRTBackend":
        return cls(model_path)

    @classmethod
    def from_buffer(cls, model_buffer: bytes) -> "LiteRTBackend":
        if not COMPILED_MODEL_AVAILABLE:
            raise RuntimeError(
                "from_buffer() requires ai-edge-litert ≥ 2.0 (CompiledModel API). "
                "Use from_file() instead, or upgrade: pip install 'ai-edge-litert>=2.0.0'"
            )
        backend = object.__new__(cls)
        backend._model_path = "<in-memory>"
        backend._sig_idx = 0
        backend._compiled = _CompiledModel.from_buffer(model_buffer)  # type: ignore[misc]
        backend._interp = None
        backend._input_details = None
        backend._output_details = None
        return backend

    @property
    def backend_name(self) -> str:
        return _LITERT_BACKEND

    @property
    def input_shape(self) -> tuple:
        if self._compiled is not None:
            bufs = self._compiled.create_input_buffers(self._sig_idx)
            return tuple(bufs[0].shape)
        if self._input_details is None:
            raise RuntimeError("Model not loaded: no input details available")
        return tuple(self._input_details[0]["shape"])

    @property
    def output_shape(self) -> tuple:
        if self._compiled is not None:
            bufs = self._compiled.create_output_buffers(self._sig_idx)
            return tuple(bufs[0].shape)
        if self._output_details is None:
            raise RuntimeError("Model not loaded: no output details available")
        return tuple(self._output_details[0]["shape"])

    @property
    def input_dtype(self) -> np.dtype:
        if self._compiled is not None:
            return np.dtype(np.float32)
        if self._input_details is None:
            raise RuntimeError("Model not loaded: no input details available")
        return np.dtype(self._input_details[0]["dtype"])

    def is_quantized(self) -> bool:
        """Return True if the model uses INT8 weights/activations."""
        if self._compiled is not None:
            return False
        if self._output_details is None:
            return False
        dtype = self._output_details[0]["dtype"]
        return dtype in (np.int8, np.uint8, np.int16)

    def run(self, data: np.ndarray) -> np.ndarray:
        data = np.asarray(data, dtype=np.float32)
        if data.ndim == 1:
            data = data.reshape(1, -1)

        expected = self.input_shape
        if data.shape[-1] != expected[-1]:
            raise ValueError(
                f"Input feature dimension mismatch: model expects "
                f"{expected[-1]} features, got {data.shape[-1]}. "
                f"Check feature_dimension in AgentSettings."
            )

        if self._compiled is not None:
            return self._run_compiled(data)
        return self._run_interpreter(data)

    def _run_compiled(self, data: np.ndarray) -> np.ndarray:
        """Inference via the CompiledModel API (ai-edge-litert ≥ 2.0)."""
        assert self._compiled is not None
        in_bufs = self._compiled.create_input_buffers(self._sig_idx)
        out_bufs = self._compiled.create_output_buffers(self._sig_idx)

        in_bufs[0].write(data)
        self._compiled.run(self._sig_idx, in_bufs, out_bufs)

        result: np.ndarray = out_bufs[0].read()
        return result.astype(np.float32)

    def _run_interpreter(self, data: np.ndarray) -> np.ndarray:
        """Inference via the legacy Interpreter API."""
        if self._interp is None:
            raise RuntimeError("Interpreter not initialized")
        if self._input_details is None:
            raise RuntimeError("Input details not initialized")
        if self._output_details is None:
            raise RuntimeError("Output details not initialized")

        inp = self._input_details[0]
        out = self._output_details[0]

        # Cast to model's native dtype (may be int8 for quantized models)
        typed_data = data.astype(inp["dtype"])
        self._interp.set_tensor(inp["index"], typed_data)
        self._interp.invoke()
        result = self._interp.get_tensor(out["index"])

        # Dequantize INT8/INT16 output back to float32
        if out["dtype"] != np.float32:
            quant = out.get("quantization", ())
            if isinstance(quant, (list, tuple)) and len(quant) >= 2:
                scale = float(quant[0])
                zero_point = int(quant[1])
            else:
                scale = 0.0
                zero_point = 0
            if scale != 0.0:
                result = (result.astype(np.float32) - zero_point) * scale

        return result.astype(np.float32)
