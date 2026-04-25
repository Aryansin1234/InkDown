# ─────────────────────────────────────────────────────────────────────────────
# InkDown — Dockerfile
# Builds a self-contained image with Node 20 + Chromium for Puppeteer PDF
# rendering.  No external Chrome download needed at runtime.
#
# Build:  docker build -t aryansin1234/inkdown .
# Run:    docker run -p 3000:3000 aryansin1234/inkdown
# Push:   docker push aryansin1234/inkdown:latest
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim

LABEL org.opencontainers.image.title="InkDown" \
      org.opencontainers.image.description="Markdown → PDF & DOCX converter with REST API" \
      org.opencontainers.image.source="https://github.com/Aryansin1234/InkDown"

# ── System dependencies for Chromium (used by Puppeteer) + Pandoc (DOCX) ──
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      pandoc \
      fonts-liberation \
      fonts-noto-color-emoji \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libstdc++6 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      lsb-release \
      wget \
      xdg-utils \
   && rm -rf /var/lib/apt/lists/*

# ── Tell Puppeteer to use the system Chromium instead of downloading one ───
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

# ── Create a non-root user (security best-practice) ───────────────────────
RUN groupadd --system inkdown && useradd --system --gid inkdown inkdown

# ── App directory ─────────────────────────────────────────────────────────
WORKDIR /app

# ── Install Node dependencies ──────────────────────────────────────────────
# Copy manifests first so Docker can cache this layer
COPY package*.json ./
RUN npm ci --omit=dev

# ── Copy application source ────────────────────────────────────────────────
COPY public/     ./public/
COPY src/        ./src/
COPY server.js   ./
COPY reference.docx ./

# ── Hand ownership to the non-root user ───────────────────────────────────
RUN chown -R inkdown:inkdown /app
USER inkdown

# ── Expose & start ────────────────────────────────────────────────────────
EXPOSE 3000
CMD ["node", "server.js"]
