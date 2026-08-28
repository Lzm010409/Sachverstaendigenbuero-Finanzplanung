# ADR-0002: Auth.js v5 mit Passwort-Fallback

## Status
Angenommen

## Datum
2026-08-28 (rückwirkend dokumentiert)

## Kontext
Der Zugang muss einfach einrichtbar sein (kleiner Betrieb, wenig Ops), zugleich
soll Single-Sign-on über Microsoft Entra möglich sein. Ein reines SSO würde die
Ersteinrichtung und den Notzugang erschweren.

## Entscheidung
Auth.js / NextAuth v5 mit zwei Providern: **Microsoft Entra ID** (SSO, wenn
konfiguriert) und einem **Passwort-Fallback** (Credentials-Provider). Das
Passwort wird gegen `APP_PASSWORD` in konstanter Zeit verglichen
(`src/lib/password.ts`), die Session läuft als JWT.

## Alternativen
- **Nur SSO**: höhere Sicherheit, aber keine einfache Ersteinrichtung/Notzugang →
  verworfen für diesen Einzelmandanten.
- **Eigene Benutzer-/Passwort-Tabelle mit Hashing**: mehr Aufwand und
  Angriffsfläche, ohne echten Mehrwert bei einem einzelnen Zugang → verworfen.

## Konsequenzen
- Der Passwort-Login ist ein einzelnes, geteiltes Geheimnis – deshalb mit
  Rate-Limit gegen Brute-Force abgesichert (`src/lib/rate-limit.ts`, ADR-Kontext
  Sicherheit).
- Wird echte Mehrbenutzer-Verwaltung nötig, ersetzt ein neuer ADR diesen.
