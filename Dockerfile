FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Utilizziamo npm install ed evitiamo problemi di lockfile mancante
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
