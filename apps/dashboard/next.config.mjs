/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`
      }
    ];
  }
};

export default nextConfig;

