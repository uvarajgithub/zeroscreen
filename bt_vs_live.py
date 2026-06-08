#!/usr/bin/env python3
import runpy
from pathlib import Path
runpy.run_path(Path(__file__).resolve().parent / 'scripts' / 'analysis' / 'bt_vs_live.py', run_name='__main__')
