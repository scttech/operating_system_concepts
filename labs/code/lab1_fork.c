/* Lab 1b (C) - fork, exec and wait. Linux, macOS, WSL or Codio: Windows has no fork(). */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>

int main(void) {
    /* Flush every print immediately. fork() copies the process INCLUDING its unflushed output buffer,
       so buffered text could be printed twice, or in a surprising order when output goes to a pipe or file. */
    setvbuf(stdout, NULL, _IONBF, 0);

    /* (1) fork() is called once but returns twice: 0 in the child, the child's pid in the parent. */
    pid_t pid = fork();
    if (pid == 0) {
        printf("child : fork() returned 0\n");
        _exit(7);                                   /* leave immediately; 7 becomes the exit status */
    }
    int status = 0;
    waitpid(pid, &status, 0);                       /* (2) the parent waits, then reads the child's exit status */
    printf("parent: fork() returned the child's pid (a positive number: %s)\n", pid > 0 ? "True" : "False");
    printf("parent: the child exited with code %d\n", WEXITSTATUS(status));

    /* (3) exec replaces the child's program. This is how a shell runs "echo". */
    pid = fork();
    if (pid == 0) {
        execlp("echo", "echo", "this line was printed by the echo program", (char *)NULL);
        _exit(127);                                 /* only reached if exec failed */
    }
    waitpid(pid, NULL, 0);

    /* (4) Every fork doubles the number of processes. Each process records itself in a file. */
    char path[64];
    snprintf(path, sizeof path, "/tmp/lab1_forks_%d.txt", (int)getpid());
    FILE *log = fopen(path, "w");
    if (log) fclose(log);
    pid_t root = getpid();
    for (int i = 0; i < 3; i++) fork();
    log = fopen(path, "a");
    if (log) { fprintf(log, "%d\n", (int)getpid()); fclose(log); }
    while (wait(NULL) > 0) { }                      /* wait for our own children (the grandchildren wait for theirs) */
    if (getpid() != root) _exit(0);
    int lines = 0, ch;
    log = fopen(path, "r");
    while (log && (ch = fgetc(log)) != EOF) if (ch == '\n') lines++;
    if (log) fclose(log);
    printf("3 forks in a row produced %d processes\n", lines);
    remove(path);

    /* (5) A zombie: a child that has exited but has not been waited for yet. */
    pid = fork();
    if (pid == 0) _exit(0);
    struct timespec pause = { 0, 200 * 1000 * 1000 };
    nanosleep(&pause, NULL);                        /* give the child time to exit */
    char cmd[64], state[16] = "";
    snprintf(cmd, sizeof cmd, "ps -o stat= -p %d 2>/dev/null", (int)pid);
    FILE *ps = popen(cmd, "r");
    if (ps) {
        if (fgets(state, sizeof state, ps)) state[strcspn(state, " \n")] = '\0';
        pclose(ps);
    }
    if (state[0]) printf("before wait(): ps shows the child's state as '%s' (Z means zombie)\n", state);
    waitpid(pid, NULL, 0);                          /* reaping removes the zombie */
    printf("after wait(): the zombie is gone\n");
    return 0;
}
