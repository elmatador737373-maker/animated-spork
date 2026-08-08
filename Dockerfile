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

# Copia l'interfaccia personalizzata con i pulsanti
COPY index.html /index.html

ENV PORT=10000

# Avvia ttyd con l'interfaccia personalizzata (-I /index.html) e permessi di scrittura (-W)
CMD ["sh", "-c", "ttyd -p $PORT -I /index.html -W bash"]
