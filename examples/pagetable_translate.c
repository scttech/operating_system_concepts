/* Two-level address translation for a tiny machine: 16-bit addresses = 4 + 4 + 8 bits. */
#include <stdio.h>
#include <stdint.h>

#define OFFSET_BITS 8
#define INDEX_BITS  4
#define ENTRIES     (1u << INDEX_BITS)
#define NOT_PRESENT (-1)

typedef struct { int frame[ENTRIES]; } leaf_t;      /* second level: page number -> frame number */
typedef struct { leaf_t *leaf[ENTRIES]; } root_t;   /* top level: pointer to a second-level table, or NULL */

static root_t root;                                 /* all pointers start out NULL */
static leaf_t pool[3];                              /* memory for the second-level tables we will need */
static int pool_used = 0;

static void map_page(unsigned vpn, int frame) {
    unsigned top = vpn >> INDEX_BITS, low = vpn & (ENTRIES - 1);
    if (root.leaf[top] == NULL) {                   /* (1) a second-level table is created only when first needed */
        root.leaf[top] = &pool[pool_used++];
        for (unsigned i = 0; i < ENTRIES; i++) root.leaf[top]->frame[i] = NOT_PRESENT;
    }
    root.leaf[top]->frame[low] = frame;
}

/* Returns 0 on success; 1 = no top-level entry; 2 = page not present in an existing table. */
static int translate(unsigned vaddr, unsigned *paddr) {
    unsigned offset = vaddr & ((1u << OFFSET_BITS) - 1);   /* (2) the low bits are the offset within the page */
    unsigned vpn = vaddr >> OFFSET_BITS;                   /* (3) everything above is the virtual page number */
    unsigned top = vpn >> INDEX_BITS;                      /* (4) its high bits pick the top-level entry... */
    unsigned low = vpn & (ENTRIES - 1);                    /* (5) ...and its low bits pick the entry in that table */
    leaf_t *leaf = root.leaf[top];
    if (leaf == NULL) return 1;                            /* (6) NULL pointer = "not present" at the top level */
    int frame = leaf->frame[low];
    if (frame == NOT_PRESENT) return 2;
    *paddr = ((unsigned)frame << OFFSET_BITS) | offset;    /* (7) frame number in front of the unchanged offset */
    return 0;
}

int main(void) {
    for (unsigned i = 0; i < 4; i++) map_page(0x00 + i, (int)(5 + 7 * i));    /* code  */
    for (unsigned i = 0; i < 3; i++) map_page(0x10 + i, (int)(5 + 7 * (4 + i)));  /* heap  */
    for (unsigned i = 0; i < 2; i++) map_page(0xFE + i, (int)(5 + 7 * (7 + i)));  /* stack */

    const unsigned addresses[] = { 0x0012, 0x03FF, 0x1034, 0xFE80, 0x5000, 0x0412 };
    for (unsigned k = 0; k < sizeof addresses / sizeof addresses[0]; k++) {
        unsigned a = addresses[k], vpn = a >> OFFSET_BITS, paddr = 0;
        unsigned top = vpn >> INDEX_BITS, low = vpn & (ENTRIES - 1);
        int rc = translate(a, &paddr);
        printf("0x%04X -> top %2u, second %2u, offset 0x%02X -> ", a, top, low, a & 0xFFu);
        if (rc == 0) printf("frame %2d -> physical 0x%04X\n", (int)(paddr >> OFFSET_BITS), paddr);
        else printf("PAGE FAULT (%s)\n", rc == 1 ? "no second-level table" : "page not present");
    }
    printf("second-level tables allocated: %d; entries used: %u instead of %u for one flat table\n",
           pool_used, ENTRIES + pool_used * ENTRIES, 1u << (2 * INDEX_BITS));
    return 0;
}
