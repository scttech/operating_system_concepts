/* A stack frame simulated in a byte array, so you can see what an unchecked copy overwrites. Safe: nothing here breaks real memory. Runs anywhere. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define BUF 16
#define CANARY_AT 16
#define FP_AT 20
#define RET_AT 24
#define MEM 40                      /* the frame (28 bytes) plus some caller memory above it */

static const uint32_t CANARY = 0xC0FFEE42u, FRAME_PTR = 0xBFFFF100u, RETURN_ADDR = 0x08048456u;

static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24); }
static uint32_t get32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }

static void new_frame(uint8_t *mem) {                /* (1) the buffer is the lowest part of the frame: everything above it is saved state */
    memset(mem, 0, MEM);
    put32(mem + CANARY_AT, CANARY);
    put32(mem + FP_AT, FRAME_PTR);
    put32(mem + RET_AT, RETURN_ADDR);
}
static void copy_unchecked(uint8_t *mem, const uint8_t *input, size_t n) { memcpy(mem, input, n); }          /* (2) trusts the length, like strcpy or gets */
static void copy_checked(uint8_t *mem, const uint8_t *input, size_t n) { memcpy(mem, input, n < BUF ? n : BUF); }   /* (4) never writes more than the buffer holds: the fix */

static void report(const char *label, const uint8_t *mem) {
    int canary_ok = get32(mem + CANARY_AT) == CANARY, fp_ok = get32(mem + FP_AT) == FRAME_PTR;
    uint32_t ret = get32(mem + RET_AT);
    const char *verdict = !canary_ok ? "aborted by the canary check"      /* (3) the canary sits between the buffer and the return address and is checked before returning */
                        : ret != RETURN_ADDR ? "returns to a changed address"
                        : !fp_ok ? "frame pointer damaged" : "returns normally";
    printf("%-36s canary %-6s, saved fp %-6s, return address 0x%08x -> %s\n", label, canary_ok ? "intact" : "SMASHED", fp_ok ? "intact" : "SMASHED", (unsigned)ret, verdict);
}

int main(void) {
    uint8_t mem[MEM], input[MEM];
    memset(input, 'A', sizeof input);
    const size_t sizes[4] = { 8, 16, 20, 28 };
    for (int i = 0; i < 4; i++) {
        char label[64];
        snprintf(label, sizeof label, "copy of %d bytes (unchecked):", (int)sizes[i]);
        new_frame(mem); copy_unchecked(mem, input, sizes[i]); report(label, mem);
    }
    /* an attacker who has learned the canary writes it back, and chooses the return address */
    memset(input, 'A', sizeof input);
    put32(input + CANARY_AT, CANARY); memset(input + FP_AT, 'B', 4); put32(input + RET_AT, 0x0804DEADu);
    new_frame(mem); copy_unchecked(mem, input, 28); report("crafted 28 bytes, canary known:", mem);
    memset(input, 'A', sizeof input);
    new_frame(mem); copy_checked(mem, input, 28); report("copy of 28 bytes (checked, cut to 16):", mem);
    return 0;
}
