"""File permissions: the umask, chmod and the permission bits. Unix only."""
import os
import shutil
import tempfile


def show(what, path):
    mode = os.stat(path).st_mode
    sym = "".join(c if mode & (0o400 >> i) else "-" for i, c in enumerate("rwxrwxrwx"))   # (1) nine bits: owner, group, others
    print(f"{what:<36} {mode & 0o777:03o} ({sym})")


folder = tempfile.mkdtemp(prefix="osc_mode_")
path = os.path.join(folder, "report.txt")

os.umask(0o022)                                      # (2) the umask REMOVES permission bits from newly created files
fd = os.open(path, os.O_CREAT | os.O_WRONLY, 0o666)  # (3) ask for 666 (rw-rw-rw-)...
os.close(fd)
show("created with mode 666, umask 022:", path)      # ...and the umask turns it into 644

os.chmod(path, 0o640)                                # (4) chmod sets the permissions explicitly: the umask does not apply
show("after chmod 640:", path)
os.chmod(path, 0o600)
show("after chmod 600:", path)

print("others can read the file:", "yes" if os.stat(path).st_mode & 0o004 else "no")
shutil.rmtree(folder)
