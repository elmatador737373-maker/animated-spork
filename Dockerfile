FROM ubuntu:latest

# Evita prompt interattivi durante l'installazione
ENV DEBIAN_FRONTEND=noninteractive

# Installa ttyd, strumenti di base, git, python3 e pip
RUN apt-get update && apt-get install -y \
    ttyd \
    curl \
    wget \
    git \
    vim \
    bash \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Copia l'interfaccia personalizzata
COPY index.html /index.html

ENV PORT=10000

EXPOSE 10000

# Avvia ttyd abilitando la scrittura (-W) e servendo l'HTML personalizzato
CMD ["sh", "-c", "ttyd -p $PORT -I /index.html -W bash"]
