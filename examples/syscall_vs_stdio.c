/* A system call versus a library call: why does "B" appear before "A"? */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <unistd.h>

int main(void) {
    printf("A");                            /* (1) printf only copies text into a buffer inside this process... */
    if (write(1, "B", 1) != 1) return 1;    /* (2) write() is the system call: the kernel receives "B" right away */
    printf("C\n");                          /* (3) ...and the buffer is written out later: when it is full, at a newline on a terminal, or at exit */
    return 0;                               /* (4) leaving main flushes the buffer, so "AC" is written only now */
}
