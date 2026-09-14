# Dockerfile — image de production pour le serveur Express + SQLite.
# Build multi-étapes : la première compile better-sqlite3 (module natif),
# la seconde ne garde que le runtime, sans les outils de compilation.
#
#   docker build -t grand-livre .
#   docker run -p 3000:3000 -v grand-livre-data:/app/data grand-livre
#
# (voir docker-compose.yml pour l'usage recommandé)

# ---------- étape 1 : installation des dépendances ----------
FROM node:20-bookworm-slim AS build

# python3/make/g++ : nécessaires si better-sqlite3 doit compiler depuis les
# sources (pas de binaire précompilé disponible pour cette plateforme/version
# de Node). Cette étape est jetée ensuite, son poids n'affecte pas l'image finale.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---------- étape 2 : image finale ----------
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY server/ ./
COPY public/ /app/public

# Le répertoire de données est un volume : il survit aux rebuilds de l'image
# et ne doit jamais être écrasé par le contenu de l'image elle-même.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server.js"]
