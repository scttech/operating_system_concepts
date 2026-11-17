"""Hard links, symbolic links and inodes. Unix only."""
import os
import shutil
import tempfile

folder = tempfile.mkdtemp(prefix="osc_links_")
orig, hard, soft = (os.path.join(folder, n) for n in ("original.txt", "hard.txt", "soft.txt"))

with open(orig, "w") as f:
    f.write("hello\n")
print(f"created original.txt: link count {os.stat(orig).st_nlink}")

os.link(orig, hard)                                  # (1) a hard link is a second NAME for the same inode
a, b = os.stat(orig), os.stat(hard)
print(f"after link(): link count {a.st_nlink}, same inode: {'yes' if a.st_ino == b.st_ino else 'no'}")

os.symlink(orig, soft)                               # (2) a symbolic link is a separate small file that holds a PATH
print(f"the symbolic link has its own inode: {'yes' if os.lstat(soft).st_ino != a.st_ino else 'no'}")

os.unlink(orig)                                      # (3) remove the original name: the data lives on while any name remains
with open(hard) as f:
    text = f.read()
print(f"after removing the original name: link count {os.stat(hard).st_nlink}, data still readable: {'yes' if text.startswith('h') else 'no'}")

try:                                                 # (4) the symbolic link still holds the old path, which no longer exists: it dangles
    open(soft).close()
    dangles = "no"
except OSError:
    dangles = "yes"
print(f"the symbolic link now dangles (opening it fails): {dangles}")
shutil.rmtree(folder)
