# Debian with a RISC-V cross compiler and the QEMU emulator, plus one pinned copy of xv6, built once.
FROM debian:13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git make bc gcc libc6-dev gcc-riscv64-unknown-elf qemu-system-misc ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone -q https://github.com/mit-pdos/xv6-riscv.git /xv6 \
 && git -C /xv6 checkout -q fa2ddcb7ca87a77af579380a6eafd5aff163b44f
WORKDIR /xv6
RUN make kernel/kernel fs.img
COPY --chmod=755 run-xv6.sh /usr/local/bin/run-xv6.sh
CMD ["make", "qemu", "CPUS=1"]
