import { createMDX } from 'fumadocs-mdx/next'

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
}

const withMDX = createMDX({
  // configPath: "source.config.ts" // Default is source.config.ts
})

export default withMDX(config);

