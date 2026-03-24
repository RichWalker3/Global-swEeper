# Global-swEep - Website Assessment Tool
# Multi-stage build for smaller final image

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.48.0-noble

WORKDIR /app

# Install Node.js (Playwright image is Ubuntu-based)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy static assets if any
COPY src/web/public ./dist/web/public

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Memory settings for Playwright/Chromium
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the web server
CMD ["node", "dist/web/server.js"]
