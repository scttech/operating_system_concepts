"""Build and read a master boot record: the 512-byte first sector of a disk."""
import struct

TYPES = {0x07: "NTFS / exFAT", 0x82: "Linux swap", 0x83: "Linux"}
disk = [(True, 0x83, 2048, 1048576), (False, 0x82, 1050624, 2097152), (False, 0x07, 3147776, 41943040)]

sector = bytearray(512)                              # bytes 0-445 would hold the boot code; all zero here
for i, (active, ptype, start, sectors) in enumerate(disk):
    offset = 446 + 16 * i                            # (2) four 16-byte partition entries start at byte 446
    sector[offset:offset + 16] = struct.pack(
        "<B3sB3sII",                                 # (1) "<" means little-endian: least significant byte first
        0x80 if active else 0x00,
        b"\xfe\xff\xff",                             # old cylinder-head-sector address: maxed out, so use the LBA fields
        ptype,
        b"\xfe\xff\xff",
        start,                                       # first sector, counted from the start of the disk (LBA)
        sectors,
    )
sector[510:512] = b"\x55\xaa"                        # (3) the last two bytes must be 0x55 0xAA, or the BIOS will not boot from this disk

valid = sector[510] == 0x55 and sector[511] == 0xAA
print("boot signature (bytes 510-511): " + ("0x55AA, valid" if valid else "not 0x55AA, invalid"))
first_start = None
for i in range(4):
    flag, _, ptype, _, start, sectors = struct.unpack_from("<B3sB3sII", sector, 446 + 16 * i)
    if ptype == 0 and sectors == 0:
        print(f"partition {i + 1}: unused")
        continue
    print(f"partition {i + 1}: {'active' if flag == 0x80 else 'idle':<6} type 0x{ptype:02x} {TYPES.get(ptype, 'unknown'):<14} start LBA {start:<8} size {sectors // 2048} MiB")
    if first_start is None:
        first_start = start
byte_offset = first_start * 512                      # (4) 512-byte sectors: LBA 2048 is byte 1,048,576, a multiple of 1 MiB
print(f"the first partition starts at byte {byte_offset} ({byte_offset // 1048576} MiB), aligned to 1 MiB: {byte_offset % 1048576 == 0}")
