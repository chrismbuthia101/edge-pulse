# EdgePulse Agent — Developer Task Runner
# Usage: make <target>
# Requires: poetry (https://python-poetry.org)

.DEFAULT_GOAL := help
.PHONY: help install install-all bootstrap dev run test lint fmt typecheck clean \
        service-install service-start service-stop service-status service-logs \
        wheel deb rpm windows enroll

# ── Colours ───────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

help:
	@echo ""
	@echo "  $(CYAN)EdgePulse Agent — available targets$(RESET)"
	@echo ""
	@echo "  Setup"
	@echo "    make install          Install core dependencies (inference only)"
	@echo "    make install-full     Install with TensorFlow training support"
	@echo "    make install-all      Install all optional extras"
	@echo "    make bootstrap        Generate the baseline ML model (required first run)"
	@echo "    make env              Copy .env.example → .env (skips if .env exists)"
	@echo ""
	@echo "  Run"
	@echo "    make dev              Run agent in foreground with debug logging"
	@echo "    make run              Run agent in foreground (INFO logging)"
	@echo ""
	@echo "  Quality"
	@echo "    make test             Run test suite"
	@echo "    make lint             Run black (check) + mypy"
	@echo "    make fmt              Auto-format with black"
	@echo "    make typecheck        mypy only"
	@echo ""
	@echo "  Service (Linux systemd / Windows SCM)"
	@echo "    make service-install  Install as a system service"
	@echo "    make service-start    Start the service"
	@echo "    make service-stop     Stop the service"
	@echo "    make service-status   Show service status"
	@echo "    make service-logs     Tail service logs (last 80 lines)"
	@echo ""
	@echo "  Enrollment"
	@echo "    make enroll           Enroll device with EdgePulse backend"
	@echo ""
	@echo "  Packaging"
	@echo "    make wheel            Build PyPI wheel"
	@echo "    make deb              Build Debian .deb"
	@echo "    make rpm              Build RPM .rpm"
	@echo "    make windows          Build Windows installer"
	@echo ""
	@echo "  Misc"
	@echo "    make clean            Remove __pycache__, .mypy_cache, .pytest_cache"
	@echo ""

# ── Setup ─────────────────────────────────────────────────────────────────────
install:
	poetry install --extras "api-full notifications ml-inference"

install-full:
	poetry install --extras "api-full notifications ml-full"

install-all:
	poetry install --extras "all"

bootstrap:
	@echo "$(CYAN)Bootstrapping Isolation Forest model…$(RESET)"
	poetry run python src/edgepulse/scripts/bootstrap_model.py
	@echo "$(CYAN)Done. Model written to models/$(RESET)"

env:
	@if [ -f .env ]; then \
		echo ".env already exists — skipping. Delete it and re-run to reset."; \
	else \
		cp .env.example .env && echo "$(CYAN).env created from .env.example$(RESET)"; \
	fi

# ── Run ───────────────────────────────────────────────────────────────────────
dev:
	poetry run edge-agent run --verbose

run:
	poetry run edge-agent run

# ── Quality ───────────────────────────────────────────────────────────────────
test:
	poetry run pytest -x -q

lint:
	poetry run black --check src/
	poetry run mypy src/ --ignore-missing-imports

fmt:
	poetry run black src/

typecheck:
	poetry run mypy src/ --ignore-missing-imports

# ── Service ───────────────────────────────────────────────────────────────────
service-install:
	poetry run edge-agent service install

service-start:
	poetry run edge-agent service start

service-stop:
	poetry run edge-agent service stop

service-status:
	poetry run edge-agent service status

service-logs:
	poetry run edge-agent service logs --lines 80

# ── Misc ──────────────────────────────────────────────────────────────────────
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -name "*.pyc" -delete 2>/dev/null; true
	@echo "$(CYAN)Clean done$(RESET)"

# ── Packaging ─────────────────────────────────────────────────────────────────
wheel:
	@echo "$(CYAN)Building PyPI wheel…$(RESET)"
	pip install build twine -q
	python -m build
	@echo "$(CYAN)Wheel written to dist/$(RESET)"

deb:
	@echo "$(CYAN)Building Debian package…$(RESET)"
	bash packaging/linux/build_deb.sh
	@echo "$(CYAN)Debian package written to packaging/dist/$(RESET)"

rpm:
	@echo "$(CYAN)Building RPM package…$(RESET)"
	bash packaging/linux/build_rpm.sh
	@echo "$(CYAN)RPM package written to packaging/dist/$(RESET)"

windows:
	@echo "$(CYAN)Building Windows installer…$(RESET)"
	powershell -ExecutionPolicy Bypass -File packaging/windows/build_windows.ps1
	@echo "$(CYAN)Windows installer written to packaging/dist/$(RESET)"

# ── Enrollment ───────────────────────────────────────────────────────────────
enroll:
	@echo "$(CYAN)Enrolling device with EdgePulse backend…$(RESET)"
	poetry run edge-agent enroll
	@echo "$(CYAN)Done$(RESET)"