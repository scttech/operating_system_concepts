"""A pipe between a parent and its child. Unix only."""
import os
import sys

read_end, write_end = os.pipe()                     # (1) a pipe is a kernel buffer with two ends: one to read from, one to write to
pid = os.fork()
if pid == 0:                                        # (2) the child inherited both ends; it closes the one it does not use
    os.close(write_end)
    while True:
        data = os.read(read_end, 63)                # (4) read waits for data; it returns b"" (end of file) only when every write end is closed
        if not data:
            break
        print(f"child read {len(data)} bytes: {data.decode()}")
    print("child saw end of file")
    sys.stdout.flush()
    os._exit(0)

os.close(read_end)
message = b"hello through a pipe"
sent = os.write(write_end, message)                 # (3) the parent copies the bytes into the kernel's buffer
os.close(write_end)                                 # closing the last write end is what lets the child's read return b""
_, status = os.waitpid(pid, 0)
print(f"parent wrote {sent} bytes and the child exited with status {os.waitstatus_to_exitcode(status)}")
