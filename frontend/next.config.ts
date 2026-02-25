import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://invoice-bulk.firebaseapp.com; script-src-elem 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://invoice-bulk.firebaseapp.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob: https://*.googleusercontent.com; font-src 'self' data:; connect-src 'self' http://localhost:5001 http://localhost:3000 ws://localhost:3000 wss://localhost:3000 http://localhost:3001 ws://localhost:3001 wss://localhost:3001 https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com https://accounts.google.com https://invoice-bulk.firebaseapp.com https://roxinvoice-production.up.railway.app; frame-src 'self' blob: https://invoice-bulk.firebaseapp.com https://accounts.google.com; worker-src 'self' blob:;",
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          }
        ],
      },
    ];
  },
};

export default nextConfig;
