# 1. Usiamo una versione stabile di Node.js (Alpine è più leggera)
FROM node:18-alpine

# 2. Creiamo la directory di lavoro dentro il container
WORKDIR /usr/src/app

# 3. Copiamo i file di configurazione delle dipendenze per sfruttare la cache di Docker
COPY package*.json ./

# 4. Installiamo le dipendenze (produzione)
RUN npm install --only=production

# 5. Copiamo tutto il resto del codice sorgente
COPY . .

# 6. Esponiamo la porta definita nel tuo .env (solitamente 3000)
EXPOSE 3000

# 7. Comando per avviare l'app
CMD ["node", "server.js"]
