# ── Server Dockerfile ───────────────────────────────────────────
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ dumb-init

WORKDIR /app

# ── Dependencies layer ───────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Development image ────────────────────────────────────────────
FROM base AS development
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 4000
CMD ["dumb-init", "node", "--experimental-vm-modules", "node_modules/.bin/nodemon", "server.js"]

# ── Production image ─────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create logs directory
RUN mkdir -p logs && chown -R node:node logs

# Use non-root user
USER node

EXPOSE 4000

# dumb-init handles signal forwarding for proper graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
