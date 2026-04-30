/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@autocrm/shared-types', '@autocrm/events', '@autocrm/utils'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
  },
  images: {
    domains: ['localhost'],
  },
}

export default nextConfig
