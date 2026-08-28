#!/bin/bash
# SessionStart-Hook für Claude Code on the web: installiert Abhängigkeiten und
# generiert den Prisma-Client, damit Lint, Typecheck und Tests sofort laufen.
# Idempotent und nicht-interaktiv; synchron (blockiert den Sessionstart, bis
# alles bereit ist – verhindert Race-Conditions).
set -euo pipefail

# Nur in der Web-/Remote-Umgebung nötig; lokal ist meist alles vorhanden.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# npm install (nicht ci): profitiert vom Container-Cache nach dem ersten Lauf.
npm install --no-audit --no-fund

# Prisma-Client für Typecheck/Build/Tests bereitstellen.
npx prisma generate
