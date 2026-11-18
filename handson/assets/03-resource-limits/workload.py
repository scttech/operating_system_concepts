"""Do a fixed amount of CPU-bound or waiting work, then report wall-clock time and CPU time.

Usage: workload.py cpu [rounds]    compute for about two seconds per round
       workload.py io  [rounds]    wait (sleep) for two seconds per round
"""
import sys
import time

kind = sys.argv[1] if len(sys.argv) > 1 else "cpu"
rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 1
wall0, cpu0 = time.perf_counter(), time.process_time()
for _ in range(rounds):
    if kind == "cpu":
        total = 0
        for i in range(15_000_000):             # about two seconds of arithmetic on a typical computer
            total += i * i
    else:
        time.sleep(2)                           # waiting, not computing
wall, cpu = time.perf_counter() - wall0, time.process_time() - cpu0
print(f"{kind}: wall-clock {wall:.1f} s, CPU time {cpu:.1f} s, CPU share {100 * cpu / wall:.0f}%")
