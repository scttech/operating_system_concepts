/* Build and read a master boot record: the 512-byte first sector of a disk. Runs anywhere. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef struct { int active; unsigned type; uint32_t start, sectors; } Part;

static void put32(uint8_t *p, uint32_t v) {               /* (1) multi-byte fields are little-endian: least significant byte first */
    p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24);
}
static uint32_t get32(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static const char *type_name(unsigned t) {
    switch (t) {
        case 0x07: return "NTFS / exFAT";
        case 0x82: return "Linux swap";
        case 0x83: return "Linux";
        default: return "unknown";
    }
}

int main(void) {
    const Part disk[3] = { { 1, 0x83, 2048, 1048576 }, { 0, 0x82, 1050624, 2097152 }, { 0, 0x07, 3147776, 41943040 } };
    uint8_t sector[512];
    memset(sector, 0, sizeof sector);                      /* bytes 0-445 would hold the boot code; all zero here */
    for (int i = 0; i < 3; i++) {
        uint8_t *e = sector + 446 + 16 * i;                /* (2) four 16-byte partition entries start at byte 446 */
        e[0] = disk[i].active ? 0x80 : 0x00;
        e[1] = 0xFE; e[2] = 0xFF; e[3] = 0xFF;             /* old cylinder-head-sector address: maxed out, so use the LBA fields */
        e[4] = (uint8_t)disk[i].type;
        e[5] = 0xFE; e[6] = 0xFF; e[7] = 0xFF;
        put32(e + 8, disk[i].start);                       /* first sector, counted from the start of the disk (LBA) */
        put32(e + 12, disk[i].sectors);
    }
    sector[510] = 0x55; sector[511] = 0xAA;                /* (3) the last two bytes must be 0x55 0xAA, or the BIOS will not boot from this disk */

    int valid = sector[510] == 0x55 && sector[511] == 0xAA;
    printf("boot signature (bytes 510-511): %s\n", valid ? "0x55AA, valid" : "not 0x55AA, invalid");
    uint32_t first_start = 0;
    int have_first = 0;
    for (int i = 0; i < 4; i++) {
        const uint8_t *e = sector + 446 + 16 * i;
        uint32_t start = get32(e + 8), sectors = get32(e + 12);
        if (e[4] == 0 && sectors == 0) { printf("partition %d: unused\n", i + 1); continue; }
        printf("partition %d: %-6s type 0x%02x %-14s start LBA %-8u size %u MiB\n", i + 1, e[0] == 0x80 ? "active" : "idle", e[4], type_name(e[4]), (unsigned)start, (unsigned)(sectors / 2048));
        if (!have_first) { first_start = start; have_first = 1; }
    }
    uint64_t byte_offset = (uint64_t)first_start * 512;    /* (4) 512-byte sectors: LBA 2048 is byte 1,048,576, a multiple of 1 MiB */
    printf("the first partition starts at byte %llu (%llu MiB), aligned to 1 MiB: %s\n", (unsigned long long)byte_offset, (unsigned long long)(byte_offset / 1048576), byte_offset % 1048576 == 0 ? "True" : "False");
    return 0;
}
