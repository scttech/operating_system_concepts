/* Two knobs the Linux scheduler gives every process: niceness (a priority hint) and CPU affinity. Linux only. */
#define _GNU_SOURCE
#include <errno.h>
#include <sched.h>
#include <stdio.h>
#include <sys/resource.h>
#include <unistd.h>

int main(void) {
    int before = getpriority(PRIO_PROCESS, 0);
    errno = 0;
    int r = nice(5);                                        /* (1) a higher niceness is a lower priority: the process is being "nice" to others */
    if (r == -1 && errno != 0) return 1;
    int after = getpriority(PRIO_PROCESS, 0);
    int expected = before + 5 > 19 ? 19 : before + 5;       /* niceness is capped at 19 */
    printf("nice(5) raised the niceness by 5 (capped at 19): %s\n", after == expected ? "True" : "False");

    cpu_set_t allowed;
    CPU_ZERO(&allowed);
    if (sched_getaffinity(0, sizeof allowed, &allowed) != 0) return 1;          /* (2) the set of CPUs this process is allowed to run on */
    printf("this process may run on at least one CPU: %s\n", CPU_COUNT(&allowed) >= 1 ? "True" : "False");
    int first = 0;
    while (!CPU_ISSET(first, &allowed)) first++;

    cpu_set_t only;
    CPU_ZERO(&only);
    CPU_SET(first, &only);
    if (sched_setaffinity(0, sizeof only, &only) != 0) return 1;                /* (3) pin the process: the scheduler may now use only that CPU, so its cache stays warm */
    cpu_set_t now;
    CPU_ZERO(&now);
    if (sched_getaffinity(0, sizeof now, &now) != 0) return 1;
    printf("after pinning, the allowed set is exactly that one CPU: %s\n", CPU_COUNT(&now) == 1 && CPU_ISSET(first, &now) ? "True" : "False");
    return 0;                                               /* (4) the OS balances load by moving tasks between CPUs; affinity forbids it from moving this one */
}
