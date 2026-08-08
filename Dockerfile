FROM ubuntu:latest

# Installa ttyd e gli strumenti base
RUN apt-get update && apt-get install -y \
    ttyd \
    curl \
    wget \
    git \
    vim \
    bash \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=10000

# -t enableZmodem=true abilita la barra di stato nativa
CMD ["sh", "-c", "ttyd -p $PORT -t fontSize=14 -t enableZmodem=true -W bash"]
