/* Four threads each sum the squares of their own quarter of a range. Build with: gcc -std=c99 -D_POSIX_C_SOURCE=200809L -pthread */
#include <pthread.h>
#include <stdio.h>

#define THREADS 4
#define N 1000000ULL

typedef struct { unsigned long long from, to, sum; } job_t;

static void *partial_sum(void *arg) {
    job_t *job = arg;
    unsigned long long s = 0;
    for (unsigned long long i = job->from; i < job->to; i++) s += i * i;
    job->sum = s;                                   /* (3) each thread writes only to its own slot, so no lock is needed */
    return NULL;
}

int main(void) {
    pthread_t threads[THREADS];
    job_t jobs[THREADS];
    for (int t = 0; t < THREADS; t++) {             /* (1) split the range [0, N) into one piece per thread */
        jobs[t].from = N * (unsigned long long)t / THREADS;
        jobs[t].to = N * (unsigned long long)(t + 1) / THREADS;
        pthread_create(&threads[t], NULL, partial_sum, &jobs[t]);   /* (2) start the thread: it runs while main continues */
    }
    unsigned long long total = 0;
    for (int t = 0; t < THREADS; t++) {
        pthread_join(threads[t], NULL);             /* (4) wait for the thread, then it is safe to read its result */
        printf("thread %d summed the squares of [%llu, %llu): %llu\n", t, jobs[t].from, jobs[t].to, jobs[t].sum);
        total += jobs[t].sum;
    }
    unsigned long long expected = (N - 1) * N * (2 * N - 1) / 6;      /* closed formula for 0^2 + 1^2 + ... + (N-1)^2 */
    printf("total = %llu (matches the formula: %s)\n", total, total == expected ? "True" : "False");
    return 0;
}
