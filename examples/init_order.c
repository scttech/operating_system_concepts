/* How an init system orders services: each starts as soon as everything it comes after has finished. Runs anywhere. */
#include <stdio.h>
#include <string.h>

#define N 7
#define MAXDEPS 3

typedef struct { const char *name; int duration; const char *after[MAXDEPS]; } Unit;

static const Unit units[N] = {
    { "local-fs", 2, { NULL } },
    { "network",  3, { "local-fs" } },
    { "logging",  1, { "local-fs" } },
    { "database", 4, { "network", "logging" } },
    { "web",      2, { "database", "network" } },
    { "cron",     1, { "logging" } },
    { "ssh",      1, { "network" } },
};

static int index_of(const char *name) {
    for (int i = 0; i < N; i++) if (strcmp(units[i].name, name) == 0) return i;
    return -1;
}

int main(void) {
    int start[N], finish[N], via[N], done[N] = { 0 }, scheduled = 0, serial = 0;
    while (scheduled < N) {
        int progress = 0;
        for (int i = 0; i < N; i++) {
            if (done[i]) continue;
            int ready = 1, begin = 0, from = -1;
            for (int k = 0; k < MAXDEPS && units[i].after[k]; k++) {
                int d = index_of(units[i].after[k]);
                if (!done[d]) { ready = 0; break; }          /* (1) a unit cannot start until everything it comes after has finished */
                if (finish[d] > begin || from < 0) { begin = finish[d]; from = d; }
            }
            if (!ready) continue;
            start[i] = begin; finish[i] = begin + units[i].duration; via[i] = from; done[i] = 1; scheduled++; progress = 1;
        }
        if (!progress) { printf("cycle detected: some units wait for each other forever\n"); return 1; }   /* (4) if nothing can start, the rest form a cycle */
    }
    int order[N];
    for (int i = 0; i < N; i++) order[i] = i;
    for (int i = 1; i < N; i++) {                            /* sort by start time, then by name */
        int v = order[i], j = i - 1;
        while (j >= 0 && (start[order[j]] > start[v] || (start[order[j]] == start[v] && strcmp(units[order[j]].name, units[v].name) > 0))) { order[j + 1] = order[j]; j--; }
        order[j + 1] = v;
    }
    int total = 0, last = 0;
    for (int i = 0; i < N; i++) {
        int u = order[i];
        printf("t=%-2d start %-8s (takes %d)\n", start[u], units[u].name, units[u].duration);   /* (2) units with nothing between them start at the same time */
        serial += units[u].duration;
        if (finish[u] > total) total = finish[u];
    }
    for (int i = 0; i < N; i++) if (finish[i] == total && (strcmp(units[i].name, units[last].name) < 0 || finish[last] != total)) last = i;
    char path[128] = "";
    int chain[N], len = 0;
    for (int u = last; u >= 0; u = via[u]) chain[len++] = u;
    for (int i = len - 1; i >= 0; i--) { strcat(path, units[chain[i]].name); if (i) strcat(path, " -> "); }
    printf("everything is up after %d time units; one at a time it would take %d\n", total, serial);
    printf("critical path: %s\n", path);              /* (3) the longest chain of waiting decides the total; speeding up anything else does not help */
    return 0;
}
