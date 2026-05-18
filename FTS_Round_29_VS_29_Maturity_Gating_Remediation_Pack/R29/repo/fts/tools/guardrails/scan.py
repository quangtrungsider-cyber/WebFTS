#!/usr/bin/env python3
import subprocess, sys
raise SystemExit(subprocess.call([sys.executable, '../validate.py', 'guardrails-scan'], cwd=__import__('pathlib').Path(__file__).resolve().parent))
