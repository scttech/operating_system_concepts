/* Hard links, symbolic links and inodes. Unix only. */
#define _POSIX_C_SOURCE 200809L
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

int main(void) {
    char dir[] = "/tmp/osc_links_XXXXXX", orig[64], hard[64], soft[64];
    if (mkdtemp(dir) == NULL) return 1;
    snprintf(orig, sizeof orig, "%s/original.txt", dir);
    snprintf(hard, sizeof hard, "%s/hard.txt", dir);
    snprintf(soft, sizeof soft, "%s/soft.txt", dir);

    int fd = open(orig, O_CREAT | O_WRONLY, 0644);
    if (fd < 0 || write(fd, "hello\n", 6) != 6) return 1;
    close(fd);
    struct stat a, b, c;
    if (stat(orig, &a) != 0) return 1;
    printf("created original.txt: link count %ld\n", (long)a.st_nlink);

    if (link(orig, hard) != 0) return 1;            /* (1) a hard link is a second NAME for the same inode */
    stat(orig, &a); stat(hard, &b);
    printf("after link(): link count %ld, same inode: %s\n", (long)a.st_nlink, a.st_ino == b.st_ino ? "yes" : "no");

    if (symlink(orig, soft) != 0) return 1;         /* (2) a symbolic link is a separate small file that holds a PATH */
    lstat(soft, &c);
    printf("the symbolic link has its own inode: %s\n", c.st_ino != a.st_ino ? "yes" : "no");

    if (unlink(orig) != 0) return 1;                /* (3) remove the original name: the data lives on while any name remains */
    stat(hard, &b);
    char text[16] = "";
    fd = open(hard, O_RDONLY);
    if (fd >= 0) { ssize_t n = read(fd, text, sizeof text - 1); text[n > 0 ? n : 0] = '\0'; close(fd); }
    printf("after removing the original name: link count %ld, data still readable: %s\n", (long)b.st_nlink, text[0] == 'h' ? "yes" : "no");

    int through_symlink = open(soft, O_RDONLY);     /* (4) the symbolic link still holds the old path, which no longer exists: it dangles */
    printf("the symbolic link now dangles (opening it fails): %s\n", through_symlink < 0 ? "yes" : "no");
    if (through_symlink >= 0) close(through_symlink);

    unlink(hard); unlink(soft); rmdir(dir);
    return 0;
}
