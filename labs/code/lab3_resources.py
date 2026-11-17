"""Lab 3 - Exploring system resources with Python (standard library first, then psutil)."""
import os
import platform
import shutil
import sys
import time

try:
    import psutil                   # install with:  python -m pip install psutil
except ImportError:
    psutil = None

print("== The basics (standard library only) ==")
print(f"operating system: {platform.system()} {platform.release()}")
print(f"logical CPUs:     {os.cpu_count()}")
total, used, free = shutil.disk_usage(os.path.abspath(os.sep))
print(f"disk:             {used / 2**30:.0f} GiB used of {total / 2**30:.0f} GiB ({used / total:.0%})")

if psutil is None:
    print("\npsutil is not installed. Run:  python -m pip install psutil   then run this lab again.")
    sys.exit(0)

print("\n== CPU ==")
print(f"physical cores: {psutil.cpu_count(logical=False)}   logical cores: {psutil.cpu_count()}")
busy = psutil.cpu_percent(interval=1, percpu=True)          # (1) measured over 1 second
print(f"busy % per logical core over 1 s: {busy}")

print("\n== Memory ==")
ram, swap = psutil.virtual_memory(), psutil.swap_memory()
print(f"RAM:  {ram.total / 2**30:.1f} GiB total, {ram.available / 2**30:.1f} GiB available ({ram.percent}% in use)")
print(f"swap: {swap.total / 2**30:.1f} GiB total ({swap.percent}% in use)")

print("\n== Processes ==")
rows = []
for proc in psutil.process_iter(["pid", "name", "memory_info", "num_threads", "status"]):   # (2)
    info = proc.info
    if info["memory_info"]:         # None when the OS refuses access: always handle that case
        rows.append((info["memory_info"].rss, info["pid"], info["name"] or "?", info["num_threads"], info["status"]))
rows.sort(reverse=True)
print(f"{len(rows)} processes visible. Top 5 by resident memory (RSS):")
for rss, pid, name, threads, status in rows[:5]:
    print(f"  pid {pid:>6}  {name[:24]:<24} {rss / 2**20:8.1f} MiB  {threads:>3} threads  {status}")

print("\n== This process ==")
me = psutil.Process()                                       # (3) no argument means "myself"
print(f"pid {me.pid}, {me.num_threads()} thread(s), started at {time.strftime('%H:%M:%S', time.localtime(me.create_time()))}")
print("ancestors:", " <- ".join(f"{p.name()}({p.pid})" for p in [me, *me.parents()]))   # (4) parent, grandparent, ...
