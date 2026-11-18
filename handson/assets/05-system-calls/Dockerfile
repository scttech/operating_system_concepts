# Stage 1: compile the hello program. The compiler stays behind in this stage.
FROM alpine:3.22 AS build
RUN apk add --no-cache gcc musl-dev
COPY hello.c .
RUN gcc -o hello hello.c

# Stage 2: a small image with strace, Python and the finished program.
FROM alpine:3.22
RUN apk add --no-cache strace python3
COPY --from=build /hello /usr/local/bin/hello
COPY spawn.sh /usr/local/bin/spawn.sh
