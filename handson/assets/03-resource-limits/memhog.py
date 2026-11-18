"""Allocate memory 8 MiB at a time until the kernel stops us."""
import time

chunks = []
mib = 0
while True:
    chunks.append(bytearray(8 * 1024 * 1024))   # a bytearray is filled with zeros, so its memory really is used
    mib += 8
    print(f"holding {mib} MiB", flush=True)
    time.sleep(0.05)                            # slow down a little so you can watch it grow
