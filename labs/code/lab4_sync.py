"""Lab 4 - Semaphores, the bounded buffer, and preventing deadlock."""
import collections
import threading
import time

# ---------- Part A: bounded buffer (producers and consumers) ----------
BUFFER_SIZE, PRODUCERS, CONSUMERS, ITEMS_EACH = 3, 2, 2, 6
buffer = collections.deque()
empty = threading.Semaphore(BUFFER_SIZE)    # (1) counts FREE slots; starts at the buffer size
full = threading.Semaphore(0)               # (2) counts FILLED slots; starts at zero
mutex = threading.Lock()                    # (3) protects the deque itself
consumed = []
peak = 0


def producer(pid):
    global peak
    for i in range(ITEMS_EACH):
        empty.acquire()                     # wait(empty): block if the buffer is full
        with mutex:
            buffer.append((pid, i))
            peak = max(peak, len(buffer))
        full.release()                      # signal(full): one more item is available


def consumer(count):
    for _ in range(count):
        full.acquire()                      # wait(full): block if the buffer is empty
        with mutex:
            consumed.append(buffer.popleft())
        empty.release()                     # signal(empty): one more free slot


threads = [threading.Thread(target=producer, args=(p,)) for p in range(PRODUCERS)]
threads += [threading.Thread(target=consumer, args=(PRODUCERS * ITEMS_EACH // CONSUMERS,)) for _ in range(CONSUMERS)]
for t in threads:
    t.start()
for t in threads:
    t.join()
in_order = all([i for p, i in consumed if p == who] == list(range(ITEMS_EACH)) for who in range(PRODUCERS))
print(f"bounded buffer: produced {PRODUCERS * ITEMS_EACH}, consumed {len(consumed)}, "
      f"largest buffer size seen {peak} (limit {BUFFER_SIZE}), each producer's items stayed in order: {in_order}")

# ---------- Part B: dining philosophers ----------
N, MEALS, PATIENCE = 5, 3, 2.0


def dinner(name, pick_order):
    forks = [threading.Lock() for _ in range(N)]
    sit_down = threading.Barrier(N)
    abort = threading.Event()
    meals = [0] * N

    def philosopher(i):
        first, second = pick_order(i, (i + 1) % N)          # which fork to pick up first
        sit_down.wait()                                     # everyone starts at the same moment
        for _ in range(MEALS):
            forks[first].acquire()
            time.sleep(0.05)                                # (4) think while holding one fork: this makes deadlock likely
            while not forks[second].acquire(timeout=0.05):  # (5) wait for the second fork, but keep checking for the alarm
                if abort.is_set():
                    forks[first].release()
                    return
            meals[i] += 1                                   # eat
            forks[second].release()
            forks[first].release()

    people = [threading.Thread(target=philosopher, args=(i,), daemon=True) for i in range(N)]
    for p in people:
        p.start()
    deadline = time.time() + PATIENCE
    for p in people:
        p.join(timeout=max(0.0, deadline - time.time()))
    stuck = sum(p.is_alive() for p in people)
    if stuck:
        print(f"{name}: DEADLOCK after {PATIENCE:.0f} s: {stuck} of {N} philosophers stuck, meals eaten {sum(meals)} of {N * MEALS}")
        abort.set()                                         # sound the alarm so the program can end
        for p in people:
            p.join()
    else:
        print(f"{name}: all {N} philosophers finished, {sum(meals)} meals eaten, no deadlock")


dinner("naive (left fork first)", lambda left, right: (left, right))
dinner("ordered (lower-numbered fork first)", lambda left, right: (min(left, right), max(left, right)))
