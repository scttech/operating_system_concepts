"""Lab 1a - Processes: inspect and launch them from Python (Windows, macOS and Linux)."""
import os
import subprocess
import sys
import time

# (1) Every process has an id, and a parent that created it.
print(f"this process: pid={os.getpid()}  parent pid={os.getppid()}")

# (2) Start a child program and wait for it to finish (like fork + exec + wait).
child = subprocess.run(
    [sys.executable, "-c", "import os; print('hello from child, pid', os.getpid())"],
    capture_output=True, text=True)
print(f"child said:     {child.stdout.strip()}")
print(f"child exit code: {child.returncode}")

# (3) A child reports success or failure through its exit code.
failing = subprocess.run([sys.executable, "-c", "raise SystemExit(3)"])
print(f"a failing child exits with code {failing.returncode}")

# (4) A child inherits a copy of its parent's environment (part of the PCB).
env = {**os.environ, "LAB_GREETING": "inherited!"}
shown = subprocess.run([sys.executable, "-c", "import os; print(os.environ['LAB_GREETING'])"],
                       env=env, capture_output=True, text=True)
print(f"child saw LAB_GREETING = {shown.stdout.strip()}")

# (5) Popen starts a child WITHOUT waiting, so several can run at the same time.
start = time.perf_counter()
kids = [subprocess.Popen([sys.executable, "-c", "import time; time.sleep(0.5)"]) for _ in range(4)]
print(f"started {len(kids)} children; all have different pids: {len({k.pid for k in kids}) == 4}")
for kid in kids:
    kid.wait()                      # collect each child's exit status
elapsed = time.perf_counter() - start
print(f"4 children that each sleep 0.5 s finished in {elapsed:.1f} s "
      f"({'in parallel' if elapsed < 1.6 else 'one after another'}; sequential would take 2.0 s or more)")
