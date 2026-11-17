/* Shared memory versus ordinary memory after fork(). Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
#include <stdio.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    int ordinary = 1;
    /* (1) MAP_SHARED | MAP_ANONYMOUS asks for one block of memory that parent and child will both see after fork() */
    int *shared = mmap(NULL, sizeof *shared, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    if (shared == MAP_FAILED) return 1;
    *shared = 1;

    pid_t pid = fork();
    if (pid < 0) return 1;
    if (pid == 0) {
        ordinary = 99;                              /* (2) the child changes both values; fork gave it its own copy of ordinary memory... */
        *shared = 99;                               /* ...but the shared block is the same physical memory in both processes */
        _exit(0);
    }
    wait(NULL);
    printf("ordinary variable after the child set it to 99: %d\n", ordinary);   /* (3) still 1: the child changed its own copy */
    printf("shared memory after the child set it to 99:     %d\n", *shared);    /* (4) 99: no system call or copy moved this value */
    munmap(shared, sizeof *shared);
    return 0;
}
