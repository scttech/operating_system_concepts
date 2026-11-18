"""A write-ahead log: make each change durable first, and recover after a crash by replaying only the complete records."""
import os
import tempfile

# A record is: one byte of length, the text "key=value", then a one-byte checksum (the sum of the text, modulo 256).


def append(fd, text):
    data = text.encode()
    os.write(fd, bytes([len(data)]) + data + bytes([sum(data) & 255]))
    os.fsync(fd)                                         # (1) the change counts as done only once it is on stable storage


def replay(path):
    """Apply each complete, correct record in order and stop at the first one that is not."""
    with open(path, "rb") as f:
        raw = f.read()
    state, records, i = {"A": 0, "B": 0}, 0, 0
    while i < len(raw):
        n = raw[i]
        if n == 0 or i + n + 2 > len(raw):               # (2) a record that is cut short is a torn write: ignore it
            break
        text = raw[i + 1:i + 1 + n]
        if raw[i + 1 + n] != sum(text) & 255:            # (3) a record whose checksum is wrong was damaged: stop here
            break
        key, value = text.decode().split("=")
        state[key] = int(value)
        records += 1
        i += n + 2
    return f"A={state['A']}, B={state['B']} ({records} record{'' if records == 1 else 's'})"


fd, path = tempfile.mkstemp(prefix="osc_wal_")
for entry in ("A=1", "B=2", "A=5"):
    append(fd, entry)
print("wrote 3 records (A=1, B=2, A=5) to the log")
print(f"full log replays to: {replay(path)}")

os.ftruncate(fd, os.fstat(fd).st_size - 3)               # (4) simulate a crash in the middle of the last write by cutting it short
print(f"log cut in the middle of the last record: replays to {replay(path)}")

os.lseek(fd, 6, os.SEEK_SET)                             # flip one bit in the second record's text
byte = os.read(fd, 1)
os.lseek(fd, 6, os.SEEK_SET)
os.write(fd, bytes([byte[0] ^ 1]))
print(f"a flipped bit in the second record is caught by its checksum: replays to {replay(path)}")
os.close(fd)
os.remove(path)
