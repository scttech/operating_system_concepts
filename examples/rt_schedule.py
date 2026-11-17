"""Real-time scheduling by simulation: rate-monotonic versus earliest-deadline-first."""
C = [2, 4]                      # worst-case execution time of each task
T = [5, 7]                      # period of each task; the deadline is the next release
HORIZON = 35                    # the hyperperiod: the least common multiple of the periods 5 and 7


def run(edf):
    """Run every tick of the horizon; return the first job that missed its deadline, or None."""
    jobs, first = [], None
    for t in range(HORIZON):
        for i in range(len(T)):
            if t % T[i] == 0:                                        # a new job is released every period
                jobs.append({"task": i, "release": t, "deadline": t + T[i], "remaining": C[i], "missed": False})
        ready = [j for j in jobs if j["remaining"] > 0]
        if ready:
            if edf:                                                  # (2) EDF: the job whose deadline is nearest runs
                pick = min(ready, key=lambda j: (j["deadline"], j["task"], j["release"]))
            else:                                                    # (1) rate-monotonic: the task with the shorter period always wins, a fixed priority
                pick = min(ready, key=lambda j: (T[j["task"]], j["task"], j["release"]))
            pick["remaining"] -= 1                                   # (3) one tick per decision, so a new arrival can preempt
        for j in jobs:
            if not j["missed"] and j["remaining"] > 0 and j["deadline"] == t + 1:
                j["missed"] = True
                if first is None:
                    first = j
    return first


utilization = sum(c / t for c, t in zip(C, T))
bound = len(T) * (2 ** (1 / len(T)) - 1)                            # (4) Liu and Layland: below this utilization rate-monotonic is guaranteed to work
print(f"utilization = {utilization:.3f} (rate-monotonic is guaranteed below {bound:.3f}, EDF up to 1.000)")
for name, edf in (("rate-monotonic", False), ("earliest-deadline-first", True)):
    miss = run(edf)
    if miss:
        print(f"{name}: first missed deadline: T{miss['task'] + 1} job released at {miss['release']} (deadline {miss['deadline']})")
    else:
        print(f"{name}: no deadline missed in {HORIZON} ticks")
