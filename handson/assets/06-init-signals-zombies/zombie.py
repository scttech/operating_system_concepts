"""Make a zombie. A grandchild is orphaned, so the kernel hands it to PID 1. When it exits, it stays a zombie unless PID 1 collects it."""
import os
import time

middle = os.fork()
if middle == 0:
    if os.fork() == 0:          # the grandchild: lives two seconds, then exits
        time.sleep(2)
        os._exit(0)
    os._exit(0)                 # the middle process exits at once, so the grandchild is orphaned
os.waitpid(middle, 0)           # we collect only our own child, as most programs do
print("started; I never wait for anything else", flush=True)
time.sleep(60)
