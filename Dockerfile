# ─── Build stage: install dependencies + Playwright browsers ───
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy package files dulu (cache layer npm install)
COPY package.json package-lock.json ./
RUN npm ci

# Install Chromium untuk Playwright (untuk endpoint /stream)
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# ─── Runtime stage ──────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copy node_modules + playwright browsers dari build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /root/.cache/ms-playwright /root/.cache/ms-playwright

# Copy source
COPY package.json ./
COPY src ./src

# User non-root (best practice)
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["node", "src/server.js"]
