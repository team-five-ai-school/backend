FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Railway sets PORT. Migrations run on startup (idempotent).
CMD ["node", "src/index.ts"]
