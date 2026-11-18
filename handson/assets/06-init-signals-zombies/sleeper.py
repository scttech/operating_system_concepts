"""Do nothing, politely, and never install a signal handler: what most programs do."""
import time

print("sleeping; I installed no signal handlers", flush=True)
while True:
    time.sleep(1)
