"""XOR parity, the idea behind RAID 5: rebuild a lost disk from the others."""
from functools import reduce

data = [b"alpha-01", b"bravo-02", b"charlie3", b"delta-04"]


def xor(*blocks):
    return bytes(reduce(lambda a, b: a ^ b, column) for column in zip(*blocks))


parity = xor(*data)                                                    # (1) the parity block is the XOR of all the data blocks
print("data disks:  " + " ".join(d.decode() for d in data))
print("parity disk: " + parity.hex())

rebuilt = xor(parity, *[d for i, d in enumerate(data) if i != 2])      # (2) disk 2 fails: XOR the parity with every disk that survived...
print(f"disk 2 fails; rebuilt from parity and the other disks: {rebuilt.decode()} (matches original: {rebuilt == data[2]})")

fresh = b"BRAVO-99"
updated = xor(parity, data[1], fresh)                                  # (3) a small write: new parity = old parity XOR old data XOR new data
recomputed = xor(data[0], fresh, data[2], data[3])
print(f"small write to disk 1: new parity from old parity, old data and new data matches a full recompute: {updated == recomputed}")
print("that small write costs 2 reads + 2 writes = 4 disk operations")

wrong = xor(parity, *[d for i, d in enumerate(data) if i not in (2, 3)])   # (4) with a second disk lost there are two unknowns and one equation: the result is wrong
print(f"a second failure (disks 2 and 3 both lost) cannot be rebuilt: wrong data produced: {wrong != data[2]}")
