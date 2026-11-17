/* A pipe between a parent and its child. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    int fd[2];
    if (pipe(fd) != 0) return 1;                    /* (1) a pipe is a kernel buffer with two ends: fd[0] to read from, fd[1] to write to */
    pid_t pid = fork();
    if (pid < 0) return 1;
    if (pid == 0) {                                 /* (2) the child inherited both ends; it closes the one it does not use */
        close(fd[1]);
        char buf[64];
        ssize_t n;
        while ((n = read(fd[0], buf, sizeof buf - 1)) > 0) {      /* (4) read waits for data; it returns 0 (end of file) only when every write end is closed */
            buf[n] = '\0';
            printf("child read %zd bytes: %s\n", n, buf);
        }
        printf("child saw end of file\n");
        close(fd[0]);
        return 0;
    }
    close(fd[0]);
    const char *msg = "hello through a pipe";
    ssize_t sent = write(fd[1], msg, strlen(msg));  /* (3) the parent copies the bytes into the kernel's buffer */
    if (sent < 0) return 1;
    close(fd[1]);                                   /* closing the last write end is what lets the child's read return 0 */
    int status = 0;
    wait(&status);
    printf("parent wrote %zd bytes and the child exited with status %d\n", sent, WEXITSTATUS(status));
    return 0;
}
