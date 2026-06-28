# Hermes Agent — runner Node léger pour les agents IA planifiés.
FROM node:20-alpine

WORKDIR /app

# Installe d'abord les dépendances (cache de couche).
COPY package.json ./
RUN npm install --omit=dev

# Code des agents + orchestrateur.
COPY . .

# Fuseau par défaut (surchargé par TZ dans l'environnement).
ENV NODE_ENV=production

CMD ["node", "scheduler.js"]
