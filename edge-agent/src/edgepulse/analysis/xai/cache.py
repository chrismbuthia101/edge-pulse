from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from typing import Dict, Optional
import numpy as np

from edgepulse.analysis.xai.models import StrictExplanationJSON

MAX_CACHE_SIZE = 256


class _ExplanationCache:

    def __init__(self, maxsize: int = MAX_CACHE_SIZE):
        self._cache: OrderedDict[str, StrictExplanationJSON] = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    @staticmethod
    def _key(model_id: str, features: "np.ndarray") -> str:
        raw = model_id.encode() + features.tobytes()
        return hashlib.sha256(raw).hexdigest()

    def get(self, model_id: str, features: "np.ndarray") -> Optional[StrictExplanationJSON]:
        key = self._key(model_id, features)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self.hits += 1
                return self._cache[key]
            self.misses += 1
            return None

    def put(self, model_id: str, features: "np.ndarray", value: StrictExplanationJSON) -> None:
        key = self._key(model_id, features)
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            if len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> Dict[str, int]:
        with self._lock:
            return {"size": len(self._cache), "hits": self.hits, "misses": self.misses}
