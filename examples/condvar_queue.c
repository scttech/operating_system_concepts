/* A bounded queue shared by producers and consumers: one mutex, two condition variables. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <stdio.h>

#define CAPACITY 4
#define PRODUCERS 2
#define CONSUMERS 2
#define ITEMS_EACH 100

static int queue[CAPACITY];
static int head = 0, tail = 0, count = 0, most = 0, finished = 0;
static long sum = 0, received = 0;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;            /* (1) one mutex protects all of the shared state above */
static pthread_cond_t not_full = PTHREAD_COND_INITIALIZER;
static pthread_cond_t not_empty = PTHREAD_COND_INITIALIZER;

static void *producer(void *arg) {
    (void)arg;
    for (int v = 1; v <= ITEMS_EACH; v++) {
        pthread_mutex_lock(&lock);
        while (count == CAPACITY)                                    /* (2) a WHILE, not an if: after waking, check the condition again */
            pthread_cond_wait(&not_full, &lock);                     /* (3) releases the mutex and sleeps as one step; relocks before returning */
        queue[tail] = v;
        tail = (tail + 1) % CAPACITY;
        count++;
        if (count > most) most = count;
        pthread_cond_signal(&not_empty);                             /* (4) tell one sleeping consumer that there is something to take */
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}

static void *consumer(void *arg) {
    (void)arg;
    for (;;) {
        pthread_mutex_lock(&lock);
        while (count == 0 && !finished)
            pthread_cond_wait(&not_empty, &lock);
        if (count == 0) { pthread_mutex_unlock(&lock); return NULL; }   /* (5) nothing left and no more coming: stop instead of sleeping forever */
        sum += queue[head];
        head = (head + 1) % CAPACITY;
        count--;
        received++;
        pthread_cond_signal(&not_full);
        pthread_mutex_unlock(&lock);
    }
}

int main(void) {
    pthread_t p[PRODUCERS], c[CONSUMERS];
    for (int i = 0; i < CONSUMERS; i++) pthread_create(&c[i], NULL, consumer, NULL);
    for (int i = 0; i < PRODUCERS; i++) pthread_create(&p[i], NULL, producer, NULL);
    for (int i = 0; i < PRODUCERS; i++) pthread_join(p[i], NULL);
    pthread_mutex_lock(&lock);
    finished = 1;
    pthread_cond_broadcast(&not_empty);                              /* wake every sleeping consumer so it can notice that the work is over */
    pthread_mutex_unlock(&lock);
    for (int i = 0; i < CONSUMERS; i++) pthread_join(c[i], NULL);
    printf("%d producers sent %d items each; %d consumers received %ld items (sum of values = %ld)\n", PRODUCERS, ITEMS_EACH, CONSUMERS, received, sum);
    printf("the queue never held more than %d items: %s\n", CAPACITY, most <= CAPACITY ? "True" : "False");
    return 0;
}
