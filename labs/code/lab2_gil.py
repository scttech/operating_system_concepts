"""Lab 2b - Threads versus processes for CPU-bound work (the Global Interpreter Lock)."""
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

TASKS, SIZE = 4, 6_000_000


def work(n):
    """(1) Pure CPU work: no waiting for I/O at all."""
    return sum(i * i for i in range(n))


def timed(label, executor_class):
    start = time.perf_counter()
    with executor_class(max_workers=TASKS) as pool:
        results = list(pool.map(work, [SIZE] * TASKS))
    elapsed = time.perf_counter() - start
    print(f"{label:<22} {elapsed:5.2f} s")
    return results, elapsed


if __name__ == "__main__":          # required on Windows and macOS so new processes can import this file safely
    start = time.perf_counter()
    expected = [work(SIZE) for _ in range(TASKS)]          # (2) baseline: one task after another
    print(f"{'one after another':<22} {time.perf_counter() - start:5.2f} s")
    by_threads, t_threads = timed(f"{TASKS} threads", ThreadPoolExecutor)          # (3) threads share one interpreter lock
    by_processes, t_processes = timed(f"{TASKS} processes", ProcessPoolExecutor)   # (4) each process has its own interpreter
    print("all three methods give the same answers:", expected == by_threads == by_processes)
