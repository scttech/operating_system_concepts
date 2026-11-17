"""A bounded queue shared by producers and consumers: one lock, two condition variables."""
import threading

CAPACITY = 4
PRODUCERS = 2
CONSUMERS = 2
ITEMS_EACH = 100

queue = []
state = {"sum": 0, "received": 0, "most": 0, "finished": False}
lock = threading.Lock()                                              # (1) one lock protects all of the shared state above
not_full = threading.Condition(lock)
not_empty = threading.Condition(lock)


def producer():
    for v in range(1, ITEMS_EACH + 1):
        with lock:
            while len(queue) == CAPACITY:                            # (2) a WHILE, not an if: after waking, check the condition again
                not_full.wait()                                      # (3) releases the lock and sleeps as one step; relocks before returning
            queue.append(v)
            state["most"] = max(state["most"], len(queue))
            not_empty.notify()                                       # (4) tell one sleeping consumer that there is something to take


def consumer():
    while True:
        with lock:
            while not queue and not state["finished"]:
                not_empty.wait()
            if not queue:                                            # (5) nothing left and no more coming: stop instead of sleeping forever
                return
            state["sum"] += queue.pop(0)
            state["received"] += 1
            not_full.notify()


consumers = [threading.Thread(target=consumer) for _ in range(CONSUMERS)]
producers = [threading.Thread(target=producer) for _ in range(PRODUCERS)]
for t in consumers + producers:
    t.start()
for t in producers:
    t.join()
with lock:
    state["finished"] = True
    not_empty.notify_all()                                           # wake every sleeping consumer so it can notice that the work is over
for t in consumers:
    t.join()
print(f"{PRODUCERS} producers sent {ITEMS_EACH} items each; {CONSUMERS} consumers received {state['received']} items (sum of values = {state['sum']})")
print(f"the queue never held more than {CAPACITY} items: {state['most'] <= CAPACITY}")
