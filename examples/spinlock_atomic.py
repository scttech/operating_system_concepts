"""A spinlock. Pure Python has no hardware test-and-set, so a threading.Lock stands in for the atomic flag."""
import threading
import time

THREADS = 4
ITERATIONS = 2000

flag = threading.Lock()                        # stands in for the atomic flag (the lock itself is the atomic operation)
counter = 0


def spin_lock():
    # (1) try to take the flag; if someone else holds it, spin and try again (acquire(False) never waits)
    while not flag.acquire(False):
        time.sleep(0)                          # yield the CPU so the holder can run: a plain busy loop is very slow under the GIL


def spin_unlock():
    flag.release()                             # (2) release: clear the flag so another thread can take it


def worker():
    global counter
    for _ in range(ITERATIONS):
        spin_lock()
        counter += 1                           # (3) the critical section: only one thread at a time gets here
        spin_unlock()


threads = [threading.Thread(target=worker) for _ in range(THREADS)]
for t in threads:
    t.start()
for t in threads:
    t.join()                                   # (4) wait for all of them, then read the result
print(f"{THREADS} threads x {ITERATIONS} increments, protected by a spinlock: counter = {counter} (correct: {counter == THREADS * ITERATIONS})")
