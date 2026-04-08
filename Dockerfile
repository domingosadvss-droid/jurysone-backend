# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools (needed for argon2, sharp, etc.) + OpenSSL for Prisma
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev openssl

WORKDIR /app

# Install ALL dependencies (dev + prod)
COPY package*.json ./
# Copy Prisma schema early so the postinstall script can find it
COPY src/database/schema.prisma ./src/database/schema.prisma
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client (schema is at custom path)
RUN npx prisma generate --schema src/database/schema.prisma

# Compile TypeScript → JavaScript
RUN npm run build

# Verify build output exists
RUN test -f /app/dist/main.js || (echo "ERROR: Build failed - main.js not found in dist folder" && exit 1)

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine

# Runtime libs for sharp / vips + OpenSSL for Prisma
RUN apk add --no-cache libc6-compat vips openssl

WORKDIR /app

# Copy compiled app
COPY --from=builder /app/dist ./dist

# Copy node_modules (includes native binaries compiled in builder)
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json (used by some packages at runtime)
COPY package*.json ./

ENV NODE_ENV=production
# Força o Prisma a usar o binário para Alpine Linux com OpenSSL 3.x
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

EXPOSE 3001

CMD ["node", "dist/main"]
