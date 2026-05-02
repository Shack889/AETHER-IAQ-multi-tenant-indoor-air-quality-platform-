/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build keeps the Vercel/Docker deployment bundle minimal —
  // only the modules actually imported are included.
  output: 'standalone',
  transpilePackages: ['@aether/shared'],
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

module.exports = nextConfig;
