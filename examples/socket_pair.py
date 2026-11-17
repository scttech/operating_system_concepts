"""Two-way messages between a parent and a child over a connected pair of sockets. Unix only."""
import os
import socket

parent_end, child_end = socket.socketpair()         # (1) two connected ends; unlike a pipe, each end can both send and receive
pid = os.fork()
if pid == 0:
    parent_end.close()                              # (2) each process keeps one end and closes the other
    request = child_end.recv(32)
    child_end.sendall(request.upper())              # the child answers on the same socket
    child_end.close()
    os._exit(0)

child_end.close()
request = b"ping"
parent_end.sendall(request)                         # (3) send a request...
print(f"parent sent:     {request.decode()}")
reply = parent_end.recv(31)                         # (4) ...then wait for the reply: recv blocks until the child has answered
print(f"parent received: {reply.decode()}")
parent_end.close()
os.waitpid(pid, 0)
