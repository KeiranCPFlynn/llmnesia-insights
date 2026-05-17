import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The pipeline modules in src/ use Node APIs and the Anthropic / Supabase SDKs.
  // Keep them external so they run as plain Node code inside the API route.
  serverExternalPackages: ['@anthropic-ai/sdk', '@google-analytics/data', '@supabase/supabase-js'],
  // Repo lives next to other projects with their own lockfiles; pin the trace root.
  outputFileTracingRoot: root,
  // The strategist reads PROJECT_BRIEF.md at runtime via fs — make sure the
  // file is bundled into those serverless functions on Vercel.
  outputFileTracingIncludes: {
    '/api/strategy/**': ['./PROJECT_BRIEF.md'],
  },
  webpack: (config) => {
    // src/*.ts use NodeNext-style `.js` import specifiers — let webpack resolve
    // them to the TypeScript sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

export default nextConfig;
