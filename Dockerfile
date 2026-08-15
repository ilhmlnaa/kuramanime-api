# ─── Build stage: install Node.js dependencies ────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy package files dulu supaya npm ci bisa menggunakan cache layer
COPY package.json package-lock.json ./

RUN npm ci


# ─── Runtime stage ────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Copy dependencies dari build stage
COPY --from=build /app/node_modules ./node_modules

# Copy package dan source
COPY package.json ./
COPY src ./src

# Install system dependencies yang dibutuhkan Playwright/Chromium
RUN npx playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium browser untuk Playwright
RUN npx playwright install chromium

# Pastikan browser dapat diakses oleh non-root user
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app \
    && chown -R appuser:appuser /ms-playwright

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
