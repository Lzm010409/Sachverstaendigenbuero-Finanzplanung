# --- Dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# --- Build ---
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone-Output von Next.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Vollständige node_modules über die minimalen aus dem Standalone-Output legen.
# Nötig, damit die Prisma-CLI beim `migrate deploy` zur Laufzeit ALLE transitiven
# Abhängigkeiten findet (z.B. effect via @prisma/config), die der getracte
# Standalone-Output nicht enthält.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
# Quellcode + tsconfig für CLI-Tools (z.B. Selbsttest via tsx, das die
# @/-Pfad-Aliase über die tsconfig auflöst).
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Migrationen anwenden, optional Demo-Daten seeden (SEED_DEMO=true, idempotent),
# dann Server starten.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && { [ \"$SEED_DEMO\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs prisma/seed-demo.ts || true; } && { [ -n \"$SELFTEST\" ] && node node_modules/tsx/dist/cli.mjs scripts/selftest.ts || true; } && { [ \"$VALIDATE\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs scripts/validate-sevdesk.ts || true; } && { [ \"$DUMP_CP\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs scripts/dump-counterparties.ts || true; } && { [ \"$SEED_RULES\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs scripts/seed-rules.ts || true; } && { [ \"$LOADTEST\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs scripts/loadtest.ts || true; } && { [ \"$DIGEST_TEST\" = \"true\" ] && node node_modules/tsx/dist/cli.mjs scripts/digest-test.ts || true; } && node server.js"]
