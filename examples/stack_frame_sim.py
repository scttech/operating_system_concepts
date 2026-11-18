"""A stack frame simulated in a byte array, so you can see what an unchecked copy overwrites. Safe: nothing here breaks real memory."""
import struct

BUF, CANARY_AT, FP_AT, RET_AT, MEM = 16, 16, 20, 24, 40
CANARY, FRAME_PTR, RETURN_ADDR = 0xC0FFEE42, 0xBFFFF100, 0x08048456


def new_frame():                                         # (1) the buffer is the lowest part of the frame: everything above it is saved state
    mem = bytearray(MEM)
    struct.pack_into("<III", mem, CANARY_AT, CANARY, FRAME_PTR, RETURN_ADDR)
    return mem


def copy_unchecked(mem, data):
    mem[0:len(data)] = data                              # (2) trusts the length, like strcpy or gets


def copy_checked(mem, data):
    mem[0:min(len(data), BUF)] = data[:BUF]              # (4) never writes more than the buffer holds: the fix


def report(label, mem):
    canary, fp, ret = struct.unpack_from("<III", mem, CANARY_AT)
    if canary != CANARY:                                 # (3) the canary sits between the buffer and the return address and is checked before returning
        verdict = "aborted by the canary check"
    elif ret != RETURN_ADDR:
        verdict = "returns to a changed address"
    elif fp != FRAME_PTR:
        verdict = "frame pointer damaged"
    else:
        verdict = "returns normally"
    print(f"{label:<36} canary {'intact' if canary == CANARY else 'SMASHED':<6}, saved fp {'intact' if fp == FRAME_PTR else 'SMASHED':<6}, return address 0x{ret:08x} -> {verdict}")


for size in (8, 16, 20, 28):
    mem = new_frame()
    copy_unchecked(mem, b"A" * size)
    report(f"copy of {size} bytes (unchecked):", mem)
# an attacker who has learned the canary writes it back, and chooses the return address
payload = b"A" * 16 + struct.pack("<I", CANARY) + b"BBBB" + struct.pack("<I", 0x0804DEAD)
mem = new_frame()
copy_unchecked(mem, payload)
report("crafted 28 bytes, canary known:", mem)
mem = new_frame()
copy_checked(mem, b"A" * 28)
report("copy of 28 bytes (checked, cut to 16):", mem)
