#!/usr/bin/env python3
import runpy
from pathlib import Path
runpy.run_path(Path(__file__).resolve().parent / 'scripts' / 'checks' / 'check_cache3.py', run_name='__main__')