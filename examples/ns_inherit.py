"""Every process already lives inside namespaces; a container is just a process given different ones. Linux only."""
import os
import sys

KINDS = ["ipc", "mnt", "net", "pid", "user", "uts"]


def ns_ids(pid):
    """Where /proc/<pid>/ns/<kind> points, for example 'pid:[4026531836]'."""
    out = {}
    for kind in KINDS:
        try:
            out[kind] = os.readlink(f"/proc/{pid}/ns/{kind}")
        except OSError:
            pass
    return out


mine = ns_ids("self")                                              # (1) one link per kind of namespace: this process is in every kind
print(f"every process belongs to one namespace of each kind: {', '.join(KINDS)} (all present: {len(mine) == len(KINDS)})")

sys.stdout.flush()                                                 # without this, the child would inherit the unwritten text in the buffer and could print it a second time
gate_read, gate_write = os.pipe()
child = os.fork()
if child == 0:                                                     # (2) the child just waits, so the parent can look at it
    os.close(gate_write)
    os.read(gate_read, 1)
    os._exit(0)
os.close(gate_read)
same = ns_ids(child) == mine                                       # (3) fork copies the namespace memberships: same identifiers
print(f"a forked child is in the same namespaces as its parent: {same}")
os.close(gate_write)
# (4) a container runtime would instead start the child with clone() or unshare() flags that give it NEW namespaces
os.waitpid(child, 0)
