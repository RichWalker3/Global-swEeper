# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Resource defaults for hosted Chromium scraping.
# Product Forge can override these in the deployment environment.
# Pair SWEEP_CHROMIUM_USE_DEV_SHM=1 with a large container /dev/shm (see docker-compose.yml).
ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers \
    SWEEP_MAX_CONCURRENT_ASSESSMENTS=1 \
    NODE_OPTIONS=--max-old-space-size=2048 \
    SWEEP_CHROMIUM_RENDERER_PROCESS_LIMIT=6

# tini reaps zombie Chromium child processes in container environments.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npx playwright install-deps chromium \
    && PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers npx playwright install chromium --no-shell \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

RUN install -d -o node -g node /app/logs

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
