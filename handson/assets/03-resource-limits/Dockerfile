# A small Python image holding the two lab programs.
FROM python:3.12-slim
WORKDIR /lab
COPY workload.py memhog.py ./
# -u: do not buffer output, so you see each line as it is printed, even if the program is killed
ENTRYPOINT ["python", "-u"]
