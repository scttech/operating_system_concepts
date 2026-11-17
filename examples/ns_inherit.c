/* Every process already lives inside namespaces; a container is just a process given different ones. Linux only. */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

static const char *KINDS[] = { "ipc", "mnt", "net", "pid", "user", "uts" };
#define NKINDS 6

/* Read where /proc/<pid>/ns/<kind> points, for example "pid:[4026531836]". */
static int ns_id(const char *pid, const char *kind, char *out, size_t size) {
    char path[64];
    snprintf(path, sizeof path, "/proc/%s/ns/%s", pid, kind);
    ssize_t n = readlink(path, out, size - 1);
    if (n < 0) return 0;
    out[n] = '\0';
    return 1;
}

int main(void) {
    int present = 0;
    char mine[NKINDS][64];
    for (int i = 0; i < NKINDS; i++) present += ns_id("self", KINDS[i], mine[i], sizeof mine[i]);   /* (1) one link per kind of namespace: this process is in every kind */
    printf("every process belongs to one namespace of each kind: ipc, mnt, net, pid, user, uts (all present: %s)\n", present == NKINDS ? "True" : "False");

    fflush(stdout);                                    /* without this, the child would inherit the unwritten text in the buffer and print it a second time */
    int gate[2];
    if (pipe(gate) != 0) return 1;
    pid_t child = fork();
    if (child < 0) return 1;
    if (child == 0) {                                  /* (2) the child just waits, so the parent can look at it */
        close(gate[1]);
        char c;
        if (read(gate[0], &c, 1) < 0) return 1;
        return 0;
    }
    close(gate[0]);
    char pid[24], theirs[64];
    snprintf(pid, sizeof pid, "%d", (int)child);
    int same = 1;
    for (int i = 0; i < NKINDS; i++)
        if (!ns_id(pid, KINDS[i], theirs, sizeof theirs) || strcmp(mine[i], theirs) != 0) same = 0;   /* (3) fork copies the namespace memberships: same identifiers */
    printf("a forked child is in the same namespaces as its parent: %s\n", same ? "True" : "False");
    close(gate[1]);                                    /* (4) a container runtime would instead start the child with clone() or unshare() flags that give it NEW namespaces */
    wait(NULL);
    return 0;
}
