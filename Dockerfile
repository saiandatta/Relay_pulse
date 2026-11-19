# Multi-stage production build for RelayPulse
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm ci

COPY src ./src
COPY tests ./tests
RUN npm run build

# Production runner stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/relaypulse.db

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application and static assets
COPY --from=builder /app/dist ./dist

# Create persistent storage volume directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]

