/** @type {import('next').NextConfig} */
function resolveProxyTarget() {
  const candidates = [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value.replace(/\/+$/, "");
    }
  }

  return "http://localhost:4000";
}

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3010",
    "http://127.0.0.1:3010"
  ],
  async rewrites() {
    const normalizedBase = resolveProxyTarget();
    return [
      {
        source: "/api/:path*",
        destination: `${normalizedBase}/:path*`
      }
    ];
  }
};

export default nextConfig;
