"""Lab 2a - Threads, race conditions and locks."""
import threading
import time

THREADS, ITERATIONS = 4, 2000
counter = 0
lock = threading.Lock()


def unsafe_worker():
    global counter
    for _ in range(ITERATIONS):
        temp = counter              # (1) READ the shared value
        time.sleep(0)               # (2) yield the CPU: another thread can run between the read and the write
        counter = temp + 1          # (3) WRITE back a possibly stale value


def safe_worker():
    global counter
    for _ in range(ITERATIONS):
        with lock:                  # (4) only one thread at a time may be inside this block
            temp = counter
            time.sleep(0)
            counter = temp + 1


def run(worker):
    global counter
    counter = 0
    threads = [threading.Thread(target=worker) for _ in range(THREADS)]
    for t in threads:
        t.start()                   # (5) all threads now run at once
    for t in threads:
        t.join()                    # (6) wait for every thread to finish
    return counter


expected = THREADS * ITERATIONS
print(f"{THREADS} threads each add 1 to a shared counter {ITERATIONS} times; the right answer is {expected}")
for label, worker in (("without a lock", unsafe_worker), ("with a lock", safe_worker)):
    got = run(worker)
    verdict = "correct" if got == expected else f"WRONG ({expected - got} updates lost)"
    print(f"  {label:<15} got {got:>5}: {verdict}")
