"""
Setup script for EdgePulse Agent
"""

from setuptools import setup, find_packages

setup(
    name="edge-pulse-agent",
    version="1.0.0",
    description="Edge device anomaly detection agent",
    author="EdgePulse Team",
    package_dir={"": "src"},
    packages=find_packages(where="src", include=["edgepulse_win", "edgepulse_win.*"]),
    python_requires=">=3.9",
    install_requires=[
        "psutil>=5.9.0",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "scikit-learn>=1.3.0",
        "tensorflow>=2.13.0",
        "shap>=0.42.0",
        "cryptography>=41.0.0",
        "pyyaml>=6.0",
        "python-dateutil>=2.8.2",
        "pydantic>=2.5.0",
        "pydantic-settings>=2.1.0",
    ],
    extras_require={
        "cloud": ["supabase>=1.0.0"],
        "windows": ["win10toast-ng>=0.1.4"],
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "black>=23.7.0",
            "mypy>=1.5.0",
            "ruff>=0.1.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "edgepulse=edgepulse_win.cli:main",
        ],
    },
)
