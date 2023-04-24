import withPwa from 'next-pwa'
import bundleAnalyzer from '@next/bundle-analyzer'
const dist = process.env.BUILD_PATH ?? 'build'


const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/**
 * @type {import('next').NextConfig}
 */
const pwa = withPwa({
    dest: "public",
    disable: process.env.NODE_ENV === 'development',
    register: false,
    scope: process.env.NEXT_PUBLIC_BASE_PATH ?? "/",
    sw: 'service-worker.js',
    swSrc: './src/service-worker.ts',
})

const config = pwa({
  output: 'export',
  distDir: dist,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: {
    unoptimized: true,
  },
})
export default withBundleAnalyzer(config)