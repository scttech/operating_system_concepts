# A small Python image holding the two lab programs.
FROM python:3.12-slim
WORKDIR /lab
COPY sleeper.py zombie.py ./
# -u: do not buffer output, so you see each line as it is printed
ENTRYPOINT ["python", "-u"]
