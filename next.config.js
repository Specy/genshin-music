import { withSerwist } from "@serwist/turbopack";

const dist = process.env.BUILD_PATH ?? 'build'


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
export default withSerwist({
  swSrc: 'src/service-worker.ts',
  swDest: 'public/service-worker.js',
  scope: process.env.NEXT_PUBLIC_BASE_PATH ?? '/',
  register: false, // we register manually in src/serviceWorkerRegistration.ts
  disable: process.env.NODE_ENV === 'development',
  ...config
})
