/* XOR parity, the idea behind RAID 5: rebuild a lost disk from the others. Runs anywhere. */
#include <stdio.h>
#include <string.h>

#define DISKS 4
#define BLOCK 8

static void xor_into(unsigned char *dst, const unsigned char *src) { for (int i = 0; i < BLOCK; i++) dst[i] ^= src[i]; }

int main(void) {
    unsigned char data[DISKS][BLOCK + 1] = { "alpha-01", "bravo-02", "charlie3", "delta-04" };
    unsigned char parity[BLOCK] = { 0 };
    for (int d = 0; d < DISKS; d++) xor_into(parity, data[d]);          /* (1) the parity block is the XOR of all the data blocks */
    printf("data disks:  %s %s %s %s\n", data[0], data[1], data[2], data[3]);
    printf("parity disk: ");
    for (int i = 0; i < BLOCK; i++) printf("%02x", parity[i]);
    printf("\n");

    unsigned char rebuilt[BLOCK];
    memcpy(rebuilt, parity, BLOCK);                                    /* (2) disk 2 fails: XOR the parity with every disk that survived... */
    for (int d = 0; d < DISKS; d++) if (d != 2) xor_into(rebuilt, data[d]);
    printf("disk 2 fails; rebuilt from parity and the other disks: %.8s (matches original: %s)\n", (char *)rebuilt, memcmp(rebuilt, data[2], BLOCK) == 0 ? "True" : "False");

    const unsigned char fresh[BLOCK] = { 'B', 'R', 'A', 'V', 'O', '-', '9', '9' };
    unsigned char updated[BLOCK], recomputed[BLOCK] = { 0 };
    memcpy(updated, parity, BLOCK);                                    /* (3) a small write: new parity = old parity XOR old data XOR new data */
    xor_into(updated, data[1]); xor_into(updated, fresh);
    for (int d = 0; d < DISKS; d++) xor_into(recomputed, d == 1 ? fresh : data[d]);
    printf("small write to disk 1: new parity from old parity, old data and new data matches a full recompute: %s\n", memcmp(updated, recomputed, BLOCK) == 0 ? "True" : "False");
    printf("that small write costs 2 reads + 2 writes = 4 disk operations\n");

    unsigned char wrong[BLOCK];
    memcpy(wrong, parity, BLOCK);                                      /* (4) with a second disk lost there are two unknowns and one equation: the result is wrong */
    for (int d = 0; d < DISKS; d++) if (d != 2 && d != 3) xor_into(wrong, data[d]);
    printf("a second failure (disks 2 and 3 both lost) cannot be rebuilt: wrong data produced: %s\n", memcmp(wrong, data[2], BLOCK) != 0 ? "True" : "False");
    return 0;
}
