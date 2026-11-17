/* A kernel-enforced memory limit: the same idea control groups apply to a whole container. Linux only. */
#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
#include <stdio.h>
#include <sys/mman.h>
#include <sys/resource.h>

static const char *try_allocate(size_t mib) {
    void *p = mmap(NULL, mib * 1024 * 1024, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (p == MAP_FAILED) return "refused by the kernel";
    munmap(p, mib * 1024 * 1024);
    return "allowed";
}

int main(void) {
    struct rlimit limit = { 1024UL * 1024 * 1024, 1024UL * 1024 * 1024 };
    if (setrlimit(RLIMIT_AS, &limit) != 0) return 1;      /* (1) cap this process's address space at 1024 MiB; the kernel enforces it from now on */
    printf("address-space limit set to 1024 MiB\n");
    printf("allocating 4 MiB: %s\n", try_allocate(4));         /* (2) well inside the limit: the request succeeds */
    printf("allocating 2048 MiB: %s\n", try_allocate(2048));   /* (3) over the limit: the kernel says no, and the program is not killed */
    return 0;                                                  /* (4) a cgroup memory limit works the same way for a group of processes, but it can also kill */
}
