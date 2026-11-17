/* Lab 2a (C) - Threads, race conditions and locks with POSIX threads. Build with:  gcc -std=c99 -D_POSIX_C_SOURCE=200809L -pthread */
#include <pthread.h>
#include <stdio.h>

#define THREADS 4
#define ITERATIONS 200000

static volatile long counter = 0;           /* volatile: every use is a real read from or write to memory */
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static void *unsafe_worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERATIONS; i++) {
        long temp = counter;                /* (1) READ the shared value */
        /* (2) Nothing to add here: the threads really run at the same moment on different CPU cores,
               so another thread can slip in between the read and the write all by itself. */
        counter = temp + 1;                 /* (3) WRITE back a possibly stale value */
    }
    return NULL;
}

static void *safe_worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERATIONS; i++) {
        pthread_mutex_lock(&lock);          /* (4) only one thread at a time may be between lock and unlock */
        long temp = counter;
        counter = temp + 1;
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}

static long run(void *(*worker)(void *)) {
    pthread_t threads[THREADS];
    counter = 0;
    for (int i = 0; i < THREADS; i++) pthread_create(&threads[i], NULL, worker, NULL);   /* (5) all threads now run at once */
    for (int i = 0; i < THREADS; i++) pthread_join(threads[i], NULL);                    /* (6) wait for every thread to finish */
    return counter;
}

int main(void) {
    const long expected = (long)THREADS * ITERATIONS;
    printf("%d threads each add 1 to a shared counter %d times; the right answer is %ld\n", THREADS, ITERATIONS, expected);
    const char *labels[] = { "without a lock", "with a lock" };
    void *(*workers[])(void *) = { unsafe_worker, safe_worker };
    for (int k = 0; k < 2; k++) {
        long got = run(workers[k]);
        if (got == expected) printf("  %-15s got %5ld: correct\n", labels[k], got);
        else printf("  %-15s got %5ld: WRONG (%ld updates lost)\n", labels[k], got, expected - got);
    }
    return 0;
}
