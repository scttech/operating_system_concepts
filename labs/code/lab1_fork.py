"""Lab 1b - fork, exec and wait (Linux, macOS, WSL or Codio: Windows has no os.fork)."""
import functools
import os
import shutil
import subprocess
import sys
import tempfile
import time

# Flush every print immediately. fork() copies the process INCLUDING its unflushed output buffer,
# so buffered text could be printed twice, or in a surprising order when output goes to a pipe or file.
print = functools.partial(print, flush=True)

if not hasattr(os, "fork"):
    sys.exit("os.fork() is not available here. Run this lab on Linux, macOS, WSL or Codio.")

# (1) fork() is called once but returns twice: 0 in the child, the child's pid in the parent.
pid = os.fork()
if pid == 0:
    print("child : fork() returned 0")
    os._exit(7)                     # leave immediately; 7 becomes the exit status
_, status = os.waitpid(pid, 0)      # (2) the parent waits, then reads the child's exit status
print(f"parent: fork() returned the child's pid (a positive number: {pid > 0})")
print(f"parent: the child exited with code {os.WEXITSTATUS(status)}")

# (3) exec replaces the child's program. This is how a shell runs "echo".
pid = os.fork()
if pid == 0:
    os.execvp("echo", ["echo", "this line was printed by the echo program"])
os.waitpid(pid, 0)

# (4) Every fork doubles the number of processes. Each process records itself in a file.
path = os.path.join(tempfile.gettempdir(), f"lab1_forks_{os.getpid()}.txt")
open(path, "w").close()
root = os.getpid()
for _ in range(3):
    os.fork()
with open(path, "a") as log:
    log.write(f"{os.getpid()}\n")
try:
    while True:
        os.wait()                   # wait for our own children (the grandchildren wait for theirs)
except ChildProcessError:
    pass
if os.getpid() != root:
    os._exit(0)
print(f"3 forks in a row produced {len(open(path).read().split())} processes")
os.remove(path)

# (5) A zombie: a child that has exited but has not been waited for yet.
pid = os.fork()
if pid == 0:
    os._exit(0)
if shutil.which("ps"):
    time.sleep(0.2)                 # give the child time to exit
    state = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    print(f"before wait(): ps shows the child's state as '{state}' (Z means zombie)")
os.waitpid(pid, 0)                  # reaping removes the zombie
print("after wait(): the zombie is gone")
