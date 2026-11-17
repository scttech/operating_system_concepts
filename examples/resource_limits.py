"""A kernel-enforced memory limit: the same idea control groups apply to a whole container. Linux only."""
import mmap
import resource

MIB = 1024 * 1024


def try_allocate(mib):
    try:
        mmap.mmap(-1, mib * MIB).close()
    except (OSError, MemoryError):
        return "refused by the kernel"
    return "allowed"


resource.setrlimit(resource.RLIMIT_AS, (1024 * MIB, 1024 * MIB))      # (1) cap this process's address space at 1024 MiB; the kernel enforces it from now on
print("address-space limit set to 1024 MiB")
print(f"allocating 4 MiB: {try_allocate(4)}")                         # (2) well inside the limit: the request succeeds
print(f"allocating 2048 MiB: {try_allocate(2048)}")                   # (3) over the limit: the kernel says no, and the program is not killed
# (4) a cgroup memory limit works the same way for a group of processes, but it can also kill
