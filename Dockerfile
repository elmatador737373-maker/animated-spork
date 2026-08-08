# Utilizziamo l'immagine ufficiale e leggera di Node.js
FROM node:18-alpine

# Imposta la directory di lavoro all'interno del container
WORKDIR /app

# Copia i file delle dipendenze
COPY package*.json ./

# Installa le dipendenze per la produzione
RUN npm ci --only=production

# Copia il resto del codice sorgente del progetto (inclusa la cartella public)
COPY . .

# Esponi la porta su cui gira l'applicazione Express
EXPOSE 3000

# Comando per avviare l'applicazione
CMD ["npm", "start"]
