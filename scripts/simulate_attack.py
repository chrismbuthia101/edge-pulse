#!/usr/bin/env python3
"""
Attack Simulation Script

Simulates various attack patterns for testing.
"""

import time
import subprocess
import random
import psutil

def simulate_cpu_spike():
    """Simulate CPU spike."""
    print("Simulating CPU spike...")
    # Create CPU-intensive process
    subprocess.Popen(["python", "-c", "while True: pass"], shell=False)

def simulate_memory_spike():
    """Simulate memory spike."""
    print("Simulating memory spike...")
    # Allocate large amount of memory
    data = [0] * (100 * 1024 * 1024)  # 100MB
    time.sleep(10)
    del data

def simulate_network_burst():
    """Simulate network burst."""
    print("Simulating network burst...")
    # Create multiple network connections
    import socket
    for _ in range(10):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect(("8.8.8.8", 53))
            s.close()
        except:
            pass
        time.sleep(0.1)

def simulate_process_spawn():
    """Simulate rapid process spawning."""
    print("Simulating process spawn...")
    for _ in range(5):
        subprocess.Popen(["python", "-c", "import time; time.sleep(5)"], shell=False)
        time.sleep(0.5)

def main():
    """Main simulation function."""
    print("EdgeGuardian Attack Simulation")
    print("=" * 40)
    
    scenarios = [
        ("CPU Spike", simulate_cpu_spike),
        ("Memory Spike", simulate_memory_spike),
        ("Network Burst", simulate_network_burst),
        ("Process Spawn", simulate_process_spawn),
    ]
    
    print("\nAvailable scenarios:")
    for i, (name, _) in enumerate(scenarios, 1):
        print(f"{i}. {name}")
    
    choice = input("\nSelect scenario (1-4): ")
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(scenarios):
            name, func = scenarios[idx]
            print(f"\nRunning: {name}")
            func()
            print("Simulation complete")
        else:
            print("Invalid choice")
    except ValueError:
        print("Invalid input")

if __name__ == "__main__":
    main()
