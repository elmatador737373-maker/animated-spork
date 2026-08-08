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

# Imposta la porta predefinita per Render
ENV PORT=10000

# Avvia ttyd collegato a bash sulla porta specificata da Render
CMD ["sh", "-c", "ttyd -p $PORT -W bash"]
