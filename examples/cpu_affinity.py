"""Two knobs the Linux scheduler gives every process: niceness (a priority hint) and CPU affinity. Linux only."""
import os

before = os.getpriority(os.PRIO_PROCESS, 0)
os.nice(5)                                                           # (1) a higher niceness is a lower priority: the process is being "nice" to others
after = os.getpriority(os.PRIO_PROCESS, 0)
print(f"nice(5) raised the niceness by 5 (capped at 19): {after == min(19, before + 5)}")

allowed = os.sched_getaffinity(0)                                    # (2) the set of CPUs this process is allowed to run on
print(f"this process may run on at least one CPU: {len(allowed) >= 1}")
first = min(allowed)

os.sched_setaffinity(0, {first})                                     # (3) pin the process: the scheduler may now use only that CPU, so its cache stays warm
print(f"after pinning, the allowed set is exactly that one CPU: {os.sched_getaffinity(0) == {first}}")
# (4) the OS balances load by moving tasks between CPUs; affinity forbids it from moving this one
