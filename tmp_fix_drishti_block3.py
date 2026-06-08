#!/usr/bin/env python3
import runpy
from pathlib import Path
runpy.run_path(Path(__file__).resolve().parent / 'scripts' / 'tmp' / 'tmp_fix_drishti_block3.py', run_name='__main__')