"""How an init system orders services: each starts as soon as everything it comes after has finished."""
units = [
    ("local-fs", 2, []),
    ("network", 3, ["local-fs"]),
    ("logging", 1, ["local-fs"]),
    ("database", 4, ["network", "logging"]),
    ("web", 2, ["database", "network"]),
    ("cron", 1, ["logging"]),
    ("ssh", 1, ["network"]),
]
duration = {name: d for name, d, _ in units}
after = {name: deps for name, _, deps in units}
start, finish, via = {}, {}, {}

pending = [name for name, _, _ in units]
while pending:
    ready = [n for n in pending if all(d in finish for d in after[n])]    # (1) a unit cannot start until everything it comes after has finished
    if not ready:
        print("cycle detected: some units wait for each other forever")   # (4) if nothing can start, the rest form a cycle
        raise SystemExit(1)
    for n in ready:
        begin, source = 0, None
        for d in after[n]:
            if source is None or finish[d] > begin:
                begin, source = finish[d], d
        start[n], finish[n], via[n] = begin, begin + duration[n], source
    pending = [n for n in pending if n not in finish]

for n in sorted(start, key=lambda n: (start[n], n)):
    print(f"t={start[n]:<2} start {n:<8} (takes {duration[n]})")           # (2) units with nothing between them start at the same time
total = max(finish.values())
print(f"everything is up after {total} time units; one at a time it would take {sum(duration.values())}")
node = min(n for n in finish if finish[n] == total)
chain = []
while node is not None:
    chain.append(node)
    node = via[node]
print("critical path: " + " -> ".join(reversed(chain)))                # (3) the longest chain of waiting decides the total; speeding up anything else does not help
