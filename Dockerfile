# syntax=docker/dockerfile:1

# Stage 1: deps — install all node_modules
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: builder — build the Next.js application
FROM node:22-alpine AS builder
WORKDIR /app

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# IMPORTANT: Next.js bakes next.config.ts rewrites into routes-manifest.json at BUILD time.
# These ARGs must match the Docker service hostnames so the proxy destinations are correct.
ARG HASURA_URL=http://hasura:8080
ARG AUTH_URL=http://auth:8081
ARG DISCOVERY_URL=http://account_detector:8082

ENV HASURA_URL=$HASURA_URL
ENV AUTH_URL=$AUTH_URL
ENV DISCOVERY_URL=$DISCOVERY_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the Next.js app (output: standalone) — rewrites baked with above URLs
RUN npm run build

# Stage 3: runner — minimal production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# next.config.ts rewrites use HASURA_URL / AUTH_URL / etc. at runtime
# These must be passed via docker-compose env or docker run -e flags

CMD ["node", "server.js"]
