/** @type {import('next').NextConfig} */

// Sicherheits-Header für alle Antworten. Bewusst konservativ gewählt, damit die
// App nicht bricht:
//  - HSTS, nosniff, DENY-Framing, Referrer- und Permissions-Policy sind
//    risikolos und decken die wichtigsten Header der Security-Checkliste ab.
//  - Die CSP erlaubt 'unsafe-inline' für Skripte/Styles, weil Next.js Inline-
//    Hydration-Skripte und die App zahlreiche Inline-Styles (Recharts, Ampel-
//    farben) nutzt. Eine strikte nonce-basierte CSP wäre ein umfangreicher,
//    fehleranfälliger Umbau und ist als Folgeschritt vorgemerkt. Framing bleibt
//    über frame-ancestors 'none' trotzdem unterbunden.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    // OAuth-Discovery unter den standardisierten .well-known-Pfaden (RFC 8414 /
    // RFC 9728) auf die App-Routen abbilden, damit claude.ai den OAuth-Server
    // automatisch findet.
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
      {
        // Manche Clients hängen den Ressourcenpfad an.
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/api/oauth/protected-resource",
      },
    ];
  },
};

export default nextConfig;
