"""Shared memory versus ordinary memory after fork(). Unix only."""
import mmap
import os

ordinary = [1]
shared = mmap.mmap(-1, 1)                           # (1) an anonymous mmap is shared with a forked child: one block of memory both processes see
shared[0] = 1

pid = os.fork()
if pid == 0:
    ordinary[0] = 99                                # (2) the child changes both values; fork gave it its own copy of ordinary memory...
    shared[0] = 99                                  # ...but the shared block is the same physical memory in both processes
    os._exit(0)
os.waitpid(pid, 0)
print(f"ordinary variable after the child set it to 99: {ordinary[0]}")      # (3) still 1: the child changed its own copy
print(f"shared memory after the child set it to 99:     {shared[0]}")        # (4) 99: no system call or copy moved this value
shared.close()
