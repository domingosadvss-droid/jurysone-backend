# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools (needed for argon2, sharp, etc.) + OpenSSL for Prisma
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev openssl

WORKDIR /app

COPY package*.json ./
COPY src/database/schema.prisma ./src/database/schema.prisma
RUN npm ci

COPY . .

RUN npx prisma generate --schema src/database/schema.prisma

RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine

# Runtime libs for sharp / vips + OpenSSL for Prisma
RUN apk add --no-cache libc6-compat vips openssl

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

EXPOSE 3001

CMD ["node", "dist/main"]
