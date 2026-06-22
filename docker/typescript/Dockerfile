# ── TypeScript execution image ────────────────────────────────────
# Installs tsx at BUILD time so it's available without network access
# during execution (containers run with NetworkMode: none).
#
# Build once:  docker build -t codesync-ts:latest docker/typescript/
# Then executionService uses image: 'codesync-ts:latest'

FROM node:20-alpine

# tsx: fast TypeScript runner powered by esbuild (no tsc overhead)
RUN npm install -g tsx@4 --no-update-notifier --no-audit && \
    npm cache clean --force

RUN tsx --version

# Non-root execution user (matches HostConfig.User: '1000')
RUN adduser -u 1000 -D runner 2>/dev/null || true
