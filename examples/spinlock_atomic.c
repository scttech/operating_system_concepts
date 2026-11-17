/* build: c11 */
/* A spinlock built from one atomic hardware operation. Build with: gcc -std=c11 -D_POSIX_C_SOURCE=200809L -pthread */
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>

#define THREADS 4
#define ITERATIONS 2000

static atomic_flag lock_flag = ATOMIC_FLAG_INIT;
static long counter = 0;                       /* an ordinary variable: only the spinlock protects it */

static void spin_lock(void) {
    /* (1) test-and-set sets the flag AND returns its old value in one indivisible step.
           If the old value was already "set", someone else holds the lock, so we spin and try again. */
    while (atomic_flag_test_and_set(&lock_flag)) { }
}
static void spin_unlock(void) { atomic_flag_clear(&lock_flag); }      /* (2) release: clear the flag so another thread can take it */

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERATIONS; i++) {
        spin_lock();
        counter++;                             /* (3) the critical section: only one thread at a time gets here */
        spin_unlock();
    }
    return NULL;
}

int main(void) {
    pthread_t t[THREADS];
    for (int i = 0; i < THREADS; i++) pthread_create(&t[i], NULL, worker, NULL);
    for (int i = 0; i < THREADS; i++) pthread_join(t[i], NULL);        /* (4) wait for all of them, then read the result */
    printf("%d threads x %d increments, protected by a spinlock: counter = %ld (correct: %s)\n",
           THREADS, ITERATIONS, counter, counter == (long)THREADS * ITERATIONS ? "True" : "False");
    return 0;
}
