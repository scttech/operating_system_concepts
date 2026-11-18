/* A write-ahead log: make each change durable first, and recover after a crash by replaying only the complete records. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* A record is: one byte of length, the text "key=value", then a one-byte checksum (the sum of the text, modulo 256). */

static void append(int fd, const char *text) {
    unsigned char buf[64];
    size_t n = strlen(text);
    unsigned sum = 0;
    for (size_t i = 0; i < n; i++) sum += (unsigned char)text[i];
    buf[0] = (unsigned char)n;
    memcpy(buf + 1, text, n);
    buf[n + 1] = (unsigned char)(sum & 255);
    if (write(fd, buf, n + 2) != (ssize_t)(n + 2)) exit(1);
    if (fsync(fd) != 0) exit(1);                         /* (1) the change counts as done only once it is on stable storage */
}

/* Replay the log: apply each complete, correct record in order and stop at the first one that is not. */
static int replay(const char *path, char *out, size_t outsize) {
    FILE *f = fopen(path, "rb");
    if (!f) exit(1);
    int a = 0, b = 0, records = 0, c;
    while ((c = fgetc(f)) != EOF) {
        unsigned char text[64];
        size_t n = (size_t)c;
        if (n == 0 || n >= sizeof text || fread(text, 1, n, f) != n) break;          /* (2) a record that is cut short is a torn write: ignore it */
        int sum = fgetc(f);
        unsigned want = 0;
        for (size_t i = 0; i < n; i++) want += text[i];
        if (sum == EOF || (unsigned)sum != (want & 255)) break;                      /* (3) a record whose checksum is wrong was damaged: stop here */
        if (text[0] == 'A') a = text[2] - '0'; else b = text[2] - '0';
        records++;
    }
    fclose(f);
    snprintf(out, outsize, "A=%d, B=%d (%d record%s)", a, b, records, records == 1 ? "" : "s");
    return records;
}

int main(void) {
    char path[] = "/tmp/osc_wal_XXXXXX", result[64];
    int fd = mkstemp(path);
    if (fd < 0) return 1;
    append(fd, "A=1"); append(fd, "B=2"); append(fd, "A=5");
    printf("wrote 3 records (A=1, B=2, A=5) to the log\n");
    replay(path, result, sizeof result);
    printf("full log replays to: %s\n", result);

    off_t size = lseek(fd, 0, SEEK_END);
    if (ftruncate(fd, size - 3) != 0) return 1;                                      /* (4) simulate a crash in the middle of the last write by cutting it short */
    replay(path, result, sizeof result);
    printf("log cut in the middle of the last record: replays to %s\n", result);

    unsigned char flipped;
    if (pread(fd, &flipped, 1, 6) != 1) return 1;                                    /* flip one bit in the second record's text */
    flipped ^= 1;
    if (pwrite(fd, &flipped, 1, 6) != 1) return 1;
    replay(path, result, sizeof result);
    printf("a flipped bit in the second record is caught by its checksum: replays to %s\n", result);
    close(fd);
    unlink(path);
    return 0;
}
