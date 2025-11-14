import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

const withMDX = createMDX({
  // configPath: "source.config.ts" // 默认就是 source.config.ts
});

export default withMDX(config);

