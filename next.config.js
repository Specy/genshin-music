import withSerwistInit from '@serwist/next'
import bundleAnalyzer from '@next/bundle-analyzer'

const dist = process.env.BUILD_PATH ?? 'build'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const withSerwist = withSerwistInit({
  swSrc: 'src/service-worker.ts',
  swDest: 'public/service-worker.js',
  scope: process.env.NEXT_PUBLIC_BASE_PATH ?? '/',
  register: false, // we register manually in src/serviceWorkerRegistration.ts
  disable: process.env.NODE_ENV === 'development',
})

/**
 * @type {import('next').NextConfig}
 */
const config = {
  output: 'export',
  distDir: dist,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    unoptimized: true,
  },
}

export default withBundleAnalyzer(withSerwist(config))
