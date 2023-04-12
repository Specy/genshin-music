/**
 * @type {import('next').NextConfig}
 */
const config = {
  output: 'export',
  distDir: process.env.BUILD_PATH ?? 'build',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: {
    unoptimized: true,
  }
}

export default config