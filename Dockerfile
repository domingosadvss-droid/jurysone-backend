# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --schema src/database/schema.prisma
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache libc6-compat vips
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main"]
