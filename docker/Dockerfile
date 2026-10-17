FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npm cache clean --force && npx prisma generate
COPY --from=builder /app/dist ./dist
# Arquivos ficam com dono root (somente leitura para o app); o processo roda sem privilégios.
USER node
EXPOSE 3000
# Liveness pelo endpoint público, sem auth e sem banco.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --spider "http://localhost:${PORT:-3000}/api/os/health" || exit 1
CMD ["node", "dist/main.js"]
