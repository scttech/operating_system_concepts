/* Lab 4 (C) - Semaphores, the bounded buffer, and preventing deadlock. Build with:  gcc -std=c99 -D_POSIX_C_SOURCE=200809L -pthread */
#include <pthread.h>
#include <stdio.h>
#include <time.h>

static void pause_ms(int ms) { struct timespec t = { ms / 1000, (ms % 1000) * 1000000L }; nanosleep(&t, NULL); }

/* A counting semaphore built from a mutex and a condition variable. (POSIX has semaphores too, but macOS lacks
   the unnamed kind, and building one shows what wait() and signal() really do.) */
typedef struct { pthread_mutex_t m; pthread_cond_t c; int value; } semaphore;
static void semaphore_init(semaphore *s, int value) { pthread_mutex_init(&s->m, NULL); pthread_cond_init(&s->c, NULL); s->value = value; }
static void semaphore_wait(semaphore *s) {                       /* wait / P / acquire */
    pthread_mutex_lock(&s->m);
    while (s->value <= 0) pthread_cond_wait(&s->c, &s->m);       /* sleep until another thread signals */
    s->value--;
    pthread_mutex_unlock(&s->m);
}
static void semaphore_signal(semaphore *s) {                     /* signal / V / release */
    pthread_mutex_lock(&s->m);
    s->value++;
    pthread_cond_signal(&s->c);
    pthread_mutex_unlock(&s->m);
}

/* ---------- Part A: bounded buffer (producers and consumers) ---------- */
#define BUFFER_SIZE 3
#define PRODUCERS 2
#define CONSUMERS 2
#define ITEMS_EACH 6
typedef struct { int producer, index; } item;
static item buffer[BUFFER_SIZE], consumed[PRODUCERS * ITEMS_EACH];
static int head = 0, count = 0, peak = 0, n_consumed = 0;
static semaphore empty_slots, full_slots;                        /* (1) free slots start at the buffer size; (2) filled slots at zero */
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;        /* (3) protects the buffer itself */

static void *producer(void *arg) {
    int pid = (int)(long)arg;
    for (int i = 0; i < ITEMS_EACH; i++) {
        semaphore_wait(&empty_slots);                            /* wait(empty): block if the buffer is full */
        pthread_mutex_lock(&mutex);
        buffer[(head + count) % BUFFER_SIZE] = (item){ pid, i };
        count++;
        if (count > peak) peak = count;
        pthread_mutex_unlock(&mutex);
        semaphore_signal(&full_slots);                           /* signal(full): one more item is available */
    }
    return NULL;
}

static void *consumer(void *arg) {
    int take = (int)(long)arg;
    for (int k = 0; k < take; k++) {
        semaphore_wait(&full_slots);                             /* wait(full): block if the buffer is empty */
        pthread_mutex_lock(&mutex);
        consumed[n_consumed++] = buffer[head];
        head = (head + 1) % BUFFER_SIZE;
        count--;
        pthread_mutex_unlock(&mutex);
        semaphore_signal(&empty_slots);                          /* signal(empty): one more free slot */
    }
    return NULL;
}

static void bounded_buffer(void) {
    pthread_t t[PRODUCERS + CONSUMERS];
    semaphore_init(&empty_slots, BUFFER_SIZE);
    semaphore_init(&full_slots, 0);
    for (long p = 0; p < PRODUCERS; p++) pthread_create(&t[p], NULL, producer, (void *)p);
    for (long c = 0; c < CONSUMERS; c++) pthread_create(&t[PRODUCERS + c], NULL, consumer, (void *)(long)(PRODUCERS * ITEMS_EACH / CONSUMERS));
    for (int i = 0; i < PRODUCERS + CONSUMERS; i++) pthread_join(t[i], NULL);
    int in_order = 1;
    for (int who = 0; who < PRODUCERS; who++) {
        int next = 0;
        for (int k = 0; k < n_consumed; k++) if (consumed[k].producer == who && consumed[k].index != next++) in_order = 0;
    }
    printf("bounded buffer: produced %d, consumed %d, largest buffer size seen %d (limit %d), each producer's items stayed in order: %s\n",
           PRODUCERS * ITEMS_EACH, n_consumed, peak, BUFFER_SIZE, in_order ? "True" : "False");
}

/* ---------- Part B: dining philosophers ---------- */
#define N 5
#define MEALS 3
#define PATIENCE_MS 2000

typedef void (*pick_order_fn)(int left, int right, int *first, int *second);
static void naive(int left, int right, int *first, int *second) { *first = left; *second = right; }
static void ordered(int left, int right, int *first, int *second) { *first = left < right ? left : right; *second = left < right ? right : left; }

static pthread_mutex_t forks[N], state = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t all_seated = PTHREAD_COND_INITIALIZER;
static int seated, meals[N], done[N], alarm_on;
static pick_order_fn pick_order;

static int try_lock_for(pthread_mutex_t *m, int ms) {            /* like Python's acquire(timeout=...): poll until the time is up */
    for (int waited = 0; waited < ms; waited++) { if (pthread_mutex_trylock(m) == 0) return 1; pause_ms(1); }
    return 0;
}

static void *philosopher(void *arg) {
    int i = (int)(long)arg, first, second;
    pick_order(i, (i + 1) % N, &first, &second);                 /* which fork to pick up first */
    pthread_mutex_lock(&state);                                  /* everyone starts at the same moment (a simple barrier) */
    if (++seated == N) pthread_cond_broadcast(&all_seated);
    while (seated < N) pthread_cond_wait(&all_seated, &state);
    pthread_mutex_unlock(&state);
    for (int m = 0; m < MEALS; m++) {
        pthread_mutex_lock(&forks[first]);
        pause_ms(50);                                            /* (4) think while holding one fork: this makes deadlock likely */
        while (!try_lock_for(&forks[second], 50)) {              /* (5) wait for the second fork, but keep checking for the alarm */
            pthread_mutex_lock(&state); int stop = alarm_on; pthread_mutex_unlock(&state);
            if (stop) { pthread_mutex_unlock(&forks[first]); return NULL; }
        }
        pthread_mutex_lock(&state); meals[i]++; pthread_mutex_unlock(&state);                 /* eat */
        pthread_mutex_unlock(&forks[second]);
        pthread_mutex_unlock(&forks[first]);
    }
    pthread_mutex_lock(&state); done[i] = 1; pthread_mutex_unlock(&state);
    return NULL;
}

static void dinner(const char *name, pick_order_fn order) {
    pthread_t t[N];
    pick_order = order; seated = 0; alarm_on = 0;
    for (int i = 0; i < N; i++) { pthread_mutex_init(&forks[i], NULL); meals[i] = 0; done[i] = 0; }
    for (long i = 0; i < N; i++) pthread_create(&t[i], NULL, philosopher, (void *)i);
    int finished = 0;
    for (int waited = 0; waited < PATIENCE_MS && finished < N; waited += 10) {
        pause_ms(10);
        pthread_mutex_lock(&state);
        finished = 0; for (int i = 0; i < N; i++) finished += done[i];
        pthread_mutex_unlock(&state);
    }
    int total = 0;
    pthread_mutex_lock(&state); for (int i = 0; i < N; i++) total += meals[i]; pthread_mutex_unlock(&state);
    if (finished < N) {
        printf("%s: DEADLOCK after %d s: %d of %d philosophers stuck, meals eaten %d of %d\n", name, PATIENCE_MS / 1000, N - finished, N, total, N * MEALS);
        pthread_mutex_lock(&state); alarm_on = 1; pthread_mutex_unlock(&state);   /* sound the alarm so the program can end */
    } else {
        printf("%s: all %d philosophers finished, %d meals eaten, no deadlock\n", name, N, total);
    }
    for (int i = 0; i < N; i++) pthread_join(t[i], NULL);
}

int main(void) {
    bounded_buffer();
    dinner("naive (left fork first)", naive);
    dinner("ordered (lower-numbered fork first)", ordered);
    return 0;
}
