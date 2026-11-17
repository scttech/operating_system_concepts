"""Demand paging you can measure: memory is not assigned until a page is first touched. Linux or macOS."""
import mmap
import resource

PAGES = 256
page = mmap.PAGESIZE


def minor_faults():
    return resource.getrusage(resource.RUSAGE_SELF).ru_minflt      # page faults served without reading from disk


region = mmap.mmap(-1, PAGES * page, flags=mmap.MAP_PRIVATE)                             # (1) reserves addresses for 256 pages. No physical memory is assigned yet.
print(f"mapped {PAGES} pages: no physical memory is assigned until a page is first touched")

before = minor_faults()
for i in range(PAGES):
    region[i * page] = 1                                           # (2) first touch of each page: a page fault, and the kernel supplies a zeroed frame
first_pass = minor_faults() - before
print(f"touching each page for the first time caused page faults: {first_pass >= 8}")

before = minor_faults()
for i in range(PAGES):
    region[i * page] = 2                                           # (3) the pages are now mapped: touching them again needs no fault
second_pass = minor_faults() - before
print(f"touching them all a second time caused far fewer: {second_pass * 4 < first_pass}")
region.close()
