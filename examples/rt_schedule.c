/* Real-time scheduling by simulation: rate-monotonic versus earliest-deadline-first. Runs anywhere. */
#include <stdio.h>

#define TASKS 2
#define HORIZON 35        /* the hyperperiod: the least common multiple of the periods 5 and 7 */
#define MAXJOBS 64

typedef struct { int task, release, deadline, remaining, missed; } Job;
static const int C[TASKS] = { 2, 4 };      /* worst-case execution time of each task */
static const int T[TASKS] = { 5, 7 };      /* period of each task; the deadline is the next release */

/* The n-th root of 2, found by bisection so that no math library is needed. */
static double root_of_two(int n) {
    double lo = 1.0, hi = 2.0;
    for (int i = 0; i < 60; i++) {
        double mid = (lo + hi) / 2, p = 1.0;
        for (int k = 0; k < n; k++) p *= mid;
        if (p < 2.0) lo = mid; else hi = mid;
    }
    return lo;
}

/* Run every tick of the horizon; return how many jobs missed their deadline and describe the first one. */
static int run(int edf, int *first_task, int *first_release, int *first_deadline) {
    Job jobs[MAXJOBS];
    int n = 0, misses = 0;
    for (int t = 0; t < HORIZON; t++) {
        for (int i = 0; i < TASKS; i++)
            if (t % T[i] == 0) { Job j = { i, t, t + T[i], C[i], 0 }; jobs[n++] = j; }    /* a new job is released every period */
        int pick = -1;
        for (int k = 0; k < n; k++) {
            if (jobs[k].remaining <= 0) continue;
            if (pick < 0) { pick = k; continue; }
            int better;
            if (edf)        /* (2) EDF: the job whose deadline is nearest runs */
                better = jobs[k].deadline < jobs[pick].deadline
                      || (jobs[k].deadline == jobs[pick].deadline && (jobs[k].task < jobs[pick].task || (jobs[k].task == jobs[pick].task && jobs[k].release < jobs[pick].release)));
            else            /* (1) rate-monotonic: the task with the shorter period always wins, a fixed priority */
                better = T[jobs[k].task] < T[jobs[pick].task]
                      || (T[jobs[k].task] == T[jobs[pick].task] && (jobs[k].task < jobs[pick].task || (jobs[k].task == jobs[pick].task && jobs[k].release < jobs[pick].release)));
            if (better) pick = k;
        }
        if (pick >= 0) jobs[pick].remaining--;              /* (3) one tick per decision, so a new arrival can preempt */
        for (int k = 0; k < n; k++)
            if (!jobs[k].missed && jobs[k].remaining > 0 && jobs[k].deadline == t + 1) {
                jobs[k].missed = 1;
                if (misses++ == 0) { *first_task = jobs[k].task; *first_release = jobs[k].release; *first_deadline = jobs[k].deadline; }
            }
    }
    return misses;
}

int main(void) {
    double u = 0;
    for (int i = 0; i < TASKS; i++) u += (double)C[i] / T[i];
    double bound = TASKS * (root_of_two(TASKS) - 1.0);        /* (4) Liu and Layland: below this utilization rate-monotonic is guaranteed to work */
    printf("utilization = %.3f (rate-monotonic is guaranteed below %.3f, EDF up to 1.000)\n", u, bound);
    int task = 0, release = 0, deadline = 0;
    if (run(0, &task, &release, &deadline)) printf("rate-monotonic: first missed deadline: T%d job released at %d (deadline %d)\n", task + 1, release, deadline);
    else printf("rate-monotonic: no deadline missed in %d ticks\n", HORIZON);
    if (run(1, &task, &release, &deadline)) printf("earliest-deadline-first: first missed deadline: T%d job released at %d (deadline %d)\n", task + 1, release, deadline);
    else printf("earliest-deadline-first: no deadline missed in %d ticks\n", HORIZON);
    return 0;
}
