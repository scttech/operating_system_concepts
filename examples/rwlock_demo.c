/* A read-write lock: many readers at once, one writer alone. Linux or macOS. */
#define _POSIX_C_SOURCE 200809L
#include <pthread.h>
#include <stdio.h>

#define READERS 4
#define READS_EACH 1000
#define UPDATES 1000

static int a = 0, b = 0;                           /* the writer always changes both, so a == b whenever nobody is in the middle of an update */
static pthread_rwlock_t rw = PTHREAD_RWLOCK_INITIALIZER;

typedef struct { int reads, torn; } Result;

static void *reader(void *arg) {
    Result *r = arg;
    for (int i = 0; i < READS_EACH; i++) {
        pthread_rwlock_rdlock(&rw);                /* (1) a shared lock: any number of readers may hold it together */
        if (a != b) r->torn++;                     /* (3) holding either lock, nobody else can be mid-update, so a == b can be trusted */
        r->reads++;
        pthread_rwlock_unlock(&rw);                /* (4) release the lock, whichever kind it was */
    }
    return NULL;
}

static void *writer(void *arg) {
    (void)arg;
    for (int i = 0; i < UPDATES; i++) {
        pthread_rwlock_wrlock(&rw);                /* (2) an exclusive lock: waits until every reader and writer has left */
        a++;                                       /* in between these two lines the pair is inconsistent, but only the writer can see that */
        b++;
        pthread_rwlock_unlock(&rw);
    }
    return NULL;
}

int main(void) {
    pthread_t rt[READERS], wt;
    Result res[READERS] = {{0, 0}};
    pthread_create(&wt, NULL, writer, NULL);
    for (int i = 0; i < READERS; i++) pthread_create(&rt[i], NULL, reader, &res[i]);
    pthread_join(wt, NULL);
    long reads = 0, torn = 0;
    for (int i = 0; i < READERS; i++) { pthread_join(rt[i], NULL); reads += res[i].reads; torn += res[i].torn; }
    printf("%d readers made %ld reads; every read saw a consistent pair: %s\n", READERS, reads, torn == 0 ? "True" : "False");
    printf("the writer made %d updates; final value: %d\n", UPDATES, a);
    return 0;
}
