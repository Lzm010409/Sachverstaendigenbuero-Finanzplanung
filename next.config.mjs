/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
