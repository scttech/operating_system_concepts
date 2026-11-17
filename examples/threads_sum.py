"""Four threads each sum the squares of their own quarter of a range."""
import threading

THREADS = 4
N = 1_000_000
sums = [0] * THREADS


def partial_sum(slot, start, stop):
    sums[slot] = sum(i * i for i in range(start, stop))   # (3) each thread writes only to its own slot, so no lock is needed


pieces = [(t, N * t // THREADS, N * (t + 1) // THREADS) for t in range(THREADS)]   # (1) split the range [0, N) into one piece per thread
threads = [threading.Thread(target=partial_sum, args=piece) for piece in pieces]
for t in threads:
    t.start()                                              # (2) start the thread: it runs while the main thread continues
total = 0
for t, (slot, start, stop) in zip(threads, pieces):
    t.join()                                               # (4) wait for the thread, then it is safe to read its result
    print(f"thread {slot} summed the squares of [{start}, {stop}): {sums[slot]}")
    total += sums[slot]
expected = (N - 1) * N * (2 * N - 1) // 6                  # closed formula for 0^2 + 1^2 + ... + (N-1)^2
print(f"total = {total} (matches the formula: {total == expected})")
