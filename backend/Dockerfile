# =============================================================================
# Pariskq CRM Backend — production multi-stage image (Sahaya)
# Target: AWS EC2 + Docker. Supports PROCESS_ROLE=api | worker | all
# =============================================================================
ARG NODE_VERSION=20-bookworm-slim

# --- deps + prisma client generation (needs prisma CLI from devDependencies) ---
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci \
  && npx prisma generate

COPY src ./src

# --- runtime: production modules only ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs sahaya

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Generated Prisma client + engines from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

USER sahaya

EXPOSE 3000

# Default: single-process (Render / dev parity). Compose overrides to api/worker.
ENV PROCESS_ROLE=all
CMD ["node", "src/app.js"]
