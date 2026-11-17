/* Demand paging you can measure: memory is not assigned until a page is first touched. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
#include <stdio.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <unistd.h>

#define PAGES 256

static long minor_faults(void) {
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    return usage.ru_minflt;                         /* page faults served without reading from disk */
}

int main(void) {
    long page = sysconf(_SC_PAGESIZE);
    /* (1) mmap reserves addresses for 256 pages. No physical memory is assigned yet. */
    char *region = mmap(NULL, (size_t)(PAGES * page), PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (region == MAP_FAILED) return 1;
    printf("mapped %d pages: no physical memory is assigned until a page is first touched\n", PAGES);

    long before = minor_faults();
    for (long i = 0; i < PAGES; i++) region[i * page] = 1;      /* (2) first touch of each page: a page fault, and the kernel supplies a zeroed frame */
    long first_pass = minor_faults() - before;
    printf("touching each page for the first time caused page faults: %s\n", first_pass >= 8 ? "True" : "False");

    before = minor_faults();
    for (long i = 0; i < PAGES; i++) region[i * page] = 2;      /* (3) the pages are now mapped: touching them again needs no fault */
    long second_pass = minor_faults() - before;
    printf("touching them all a second time caused far fewer: %s\n", second_pass * 4 < first_pass ? "True" : "False");
    munmap(region, (size_t)(PAGES * page));
    return 0;
}
