import type { NextConfig } from 'next';

/* The studio is one screen that talks to Supabase and to SpicyAPI. Nothing
 * here is static-exportable and nothing wants image optimisation: the stills
 * come back from a provider CDN and from our own public bucket. */
const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;
