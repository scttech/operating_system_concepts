/* File permissions: the umask, chmod and the permission bits. Unix only. */
#define _POSIX_C_SOURCE 200809L
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

static void show(const char *what, const char *path) {
    struct stat st;
    if (stat(path, &st) != 0) { perror("stat"); exit(1); }
    char sym[10];
    for (int i = 0; i < 9; i++) sym[i] = (st.st_mode & (0400u >> i)) ? "rwxrwxrwx"[i] : '-';   /* (1) nine bits: owner, group, others */
    sym[9] = '\0';
    printf("%-36s %03o (%s)\n", what, (unsigned)(st.st_mode & 0777u), sym);
}

int main(void) {
    char dir[] = "/tmp/osc_mode_XXXXXX", path[64];
    if (mkdtemp(dir) == NULL) return 1;
    snprintf(path, sizeof path, "%s/report.txt", dir);

    umask(022);                                      /* (2) the umask REMOVES permission bits from newly created files */
    int fd = open(path, O_CREAT | O_WRONLY, 0666);   /* (3) ask for 666 (rw-rw-rw-)... */
    if (fd < 0) return 1;
    close(fd);
    show("created with mode 666, umask 022:", path); /* ...and the umask turns it into 644 */

    if (chmod(path, 0640) != 0) return 1;            /* (4) chmod sets the permissions explicitly: the umask does not apply */
    show("after chmod 640:", path);
    if (chmod(path, 0600) != 0) return 1;
    show("after chmod 600:", path);

    struct stat st;
    if (stat(path, &st) != 0) return 1;
    printf("others can read the file: %s\n", (st.st_mode & 004) ? "yes" : "no");

    remove(path);
    rmdir(dir);
    return 0;
}
