FROM ubuntu:latest

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

# Copia la pagina personalizzata
COPY index.html /index.html

ENV PORT=10000

# Avvia ttyd abilitando la scrittura (-W) e servendo il file html custom
CMD ["sh", "-c", "ttyd -p $PORT -I /index.html -W bash"]
