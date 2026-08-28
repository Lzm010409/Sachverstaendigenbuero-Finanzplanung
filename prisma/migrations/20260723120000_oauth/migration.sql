-- OAuth 2.1 Authorization Server (App-eigener OAuth für den MCP-Connector)

CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUris" TEXT NOT NULL,
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "grantTypes" TEXT NOT NULL DEFAULT 'authorization_code,refresh_token',
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthCode_code_key" ON "OAuthCode"("code");
CREATE INDEX "OAuthCode_expiresAt_idx" ON "OAuthCode"("expiresAt");
CREATE UNIQUE INDEX "OAuthToken_refreshHash_key" ON "OAuthToken"("refreshHash");
CREATE INDEX "OAuthToken_expiresAt_idx" ON "OAuthToken"("expiresAt");

ALTER TABLE "OAuthCode" ADD CONSTRAINT "OAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
