/* Two-way messages between a parent and a child over a connected pair of sockets. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    int sv[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sv) != 0) return 1;    /* (1) two connected ends; unlike a pipe, each end can both send and receive */
    pid_t pid = fork();
    if (pid < 0) return 1;
    if (pid == 0) {
        close(sv[0]);                               /* (2) each process keeps one end and closes the other */
        char buf[32];
        ssize_t n = read(sv[1], buf, sizeof buf);
        for (ssize_t i = 0; i < n; i++) buf[i] = (char)toupper((unsigned char)buf[i]);
        if (write(sv[1], buf, (size_t)n) != n) return 1;           /* the child answers on the same socket */
        close(sv[1]);
        return 0;
    }
    close(sv[1]);
    const char *request = "ping";
    if (write(sv[0], request, strlen(request)) < 0) return 1;      /* (3) send a request... */
    printf("parent sent:     %s\n", request);
    char reply[32];
    ssize_t n = read(sv[0], reply, sizeof reply - 1);              /* (4) ...then wait for the reply: read blocks until the child has answered */
    if (n < 0) return 1;
    reply[n] = '\0';
    printf("parent received: %s\n", reply);
    close(sv[0]);
    wait(NULL);
    return 0;
}
