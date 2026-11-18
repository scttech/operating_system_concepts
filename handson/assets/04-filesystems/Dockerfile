# Three layers on top of Alpine. The last one deletes the file the second one made.
FROM alpine:3.22
RUN echo one > /one.txt
RUN dd if=/dev/zero of=/big.bin bs=1M count=5
RUN rm /big.bin
