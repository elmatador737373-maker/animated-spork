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

# Copia la pagina mobile-friendly
COPY index.html /index.html

ENV PORT=10000

# Avvia ttyd caricando la pagina personalizzata
CMD ["sh", "-c", "ttyd -p $PORT -I /index.html -W bash"]
