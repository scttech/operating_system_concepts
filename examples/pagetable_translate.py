"""Two-level address translation for a tiny machine: 16-bit addresses = 4 + 4 + 8 bits."""

OFFSET_BITS = 8
INDEX_BITS = 4
ENTRIES = 1 << INDEX_BITS

root = [None] * ENTRIES                 # top level: a second-level table (a list), or None
tables_created = 0


def map_page(vpn, frame):
    global tables_created
    top, low = vpn >> INDEX_BITS, vpn & (ENTRIES - 1)
    if root[top] is None:               # (1) a second-level table is created only when first needed
        root[top] = [None] * ENTRIES
        tables_created += 1
    root[top][low] = frame


def translate(vaddr):
    """Returns (physical address, None) or (None, reason for the fault)."""
    offset = vaddr & ((1 << OFFSET_BITS) - 1)   # (2) the low bits are the offset within the page
    vpn = vaddr >> OFFSET_BITS                  # (3) everything above is the virtual page number
    top = vpn >> INDEX_BITS                     # (4) its high bits pick the top-level entry...
    low = vpn & (ENTRIES - 1)                   # (5) ...and its low bits pick the entry in that table
    leaf = root[top]
    if leaf is None:                            # (6) None = "not present" at the top level
        return None, "no second-level table"
    frame = leaf[low]
    if frame is None:
        return None, "page not present"
    return (frame << OFFSET_BITS) | offset, None    # (7) frame number in front of the unchanged offset


for i in range(4):
    map_page(0x00 + i, 5 + 7 * i)               # code
for i in range(3):
    map_page(0x10 + i, 5 + 7 * (4 + i))         # heap
for i in range(2):
    map_page(0xFE + i, 5 + 7 * (7 + i))         # stack

for a in (0x0012, 0x03FF, 0x1034, 0xFE80, 0x5000, 0x0412):
    vpn = a >> OFFSET_BITS
    print(f"0x{a:04X} -> top {vpn >> INDEX_BITS:2d}, second {vpn & (ENTRIES - 1):2d}, offset 0x{a & 0xFF:02X} -> ", end="")
    paddr, why = translate(a)
    if why is None:
        print(f"frame {paddr >> OFFSET_BITS:2d} -> physical 0x{paddr:04X}")
    else:
        print(f"PAGE FAULT ({why})")
print(f"second-level tables allocated: {tables_created}; "
      f"entries used: {ENTRIES + tables_created * ENTRIES} instead of {1 << (2 * INDEX_BITS)} for one flat table")
