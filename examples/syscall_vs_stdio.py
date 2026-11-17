"""A system call versus a library call: why does "B" appear before "A"?"""
import os

print("A", end="")                # (1) print() only copies text into a buffer inside this process...
os.write(1, b"B")                 # (2) os.write() is the system call: the kernel receives "B" right away
print("C")                        # (3) ...and the buffer is written out later: when it is full, at a newline on a terminal, or at exit
# (4) when the program ends, Python flushes the buffer, so "AC" is written only now
