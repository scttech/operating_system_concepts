"""A read-write lock: many readers at once, one writer alone. Python has none built in, so this one is built from a Condition."""
import threading

READERS = 4
READS_EACH = 1000
UPDATES = 1000


class ReadWriteLock:
    def __init__(self):
        self._cond = threading.Condition()
        self._readers = 0
        self._writing = False

    def acquire_read(self):
        with self._cond:
            while self._writing:
                self._cond.wait()
            self._readers += 1

    def release_read(self):
        with self._cond:
            self._readers -= 1
            if self._readers == 0:
                self._cond.notify_all()

    def acquire_write(self):
        with self._cond:
            while self._writing or self._readers:
                self._cond.wait()
            self._writing = True

    def release_write(self):
        with self._cond:
            self._writing = False
            self._cond.notify_all()


rw = ReadWriteLock()
pair = {"a": 0, "b": 0}                     # the writer always changes both, so a == b whenever nobody is in the middle of an update
results = [{"reads": 0, "torn": 0} for _ in range(READERS)]


def reader(result):
    for _ in range(READS_EACH):
        rw.acquire_read()                   # (1) a shared lock: any number of readers may hold it together
        if pair["a"] != pair["b"]:          # (3) holding either lock, nobody else can be mid-update, so a == b can be trusted
            result["torn"] += 1
        result["reads"] += 1
        rw.release_read()                   # (4) release the lock, whichever kind it was


def writer():
    for _ in range(UPDATES):
        rw.acquire_write()                  # (2) an exclusive lock: waits until every reader and writer has left
        pair["a"] += 1                      # in between these two lines the pair is inconsistent, but only the writer can see that
        pair["b"] += 1
        rw.release_write()


threads = [threading.Thread(target=writer)] + [threading.Thread(target=reader, args=(r,)) for r in results]
for t in threads:
    t.start()
for t in threads:
    t.join()
reads = sum(r["reads"] for r in results)
torn = sum(r["torn"] for r in results)
print(f"{READERS} readers made {reads} reads; every read saw a consistent pair: {torn == 0}")
print(f"the writer made {UPDATES} updates; final value: {pair['a']}")
