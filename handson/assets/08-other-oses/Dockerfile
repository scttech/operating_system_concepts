# Debian with the QEMU emulator (for a PC) and one pinned OpenBSD install image, checked against its published SHA-256 sum.
FROM debian:13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends qemu-system-x86 expect curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /os
RUN curl -4 -fsSL -o miniroot80.img https://cdn.openbsd.org/pub/OpenBSD/8.0/amd64/miniroot80.img \
 && echo 'fe268f373dacf249b36306096404aa578e0ceb950d08c19c5a1117806997399a  miniroot80.img' | sha256sum -c -
COPY --chmod=755 run-openbsd.exp /usr/local/bin/run-openbsd
CMD ["run-openbsd"]
