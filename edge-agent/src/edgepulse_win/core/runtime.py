"""
Runtime management for EdgePulse
"""

import threading
import time
from typing import Optional
from edgepulse_win.pipeline import Pipeline


class Runtime:
    """Runtime manager for EdgePulse agent"""
    
    def __init__(self, pipeline: Pipeline, interval: float = 1.0):
        self.pipeline = pipeline
        self.interval = interval
        self.running = False
        self.thread: Optional[threading.Thread] = None
        
    def start(self) -> None:
        """Start the runtime"""
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._run_loop)
        self.thread.daemon = True
        self.thread.start()
        
    def stop(self) -> None:
        """Stop the runtime"""
        self.running = False
        if self.thread:
            self.thread.join()
            
    def _run_loop(self) -> None:
        """Main runtime loop"""
        while self.running:
            try:
                self.pipeline.process()
                time.sleep(self.interval)
            except Exception as e:
                print(f"Runtime error: {e}")
                time.sleep(self.interval)
