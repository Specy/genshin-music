
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
import rollupNodePolyFill from 'rollup-plugin-node-polyfills'
const vite = ({ mode }) => {
    return defineConfig({

        server: {
            port: 3000,
        },
        base: './',
        resolve: {
            alias: {
                '@': resolve(__dirname, "src"),
                '$cmp': resolve(__dirname, "src/components"),
                '$lib': resolve(__dirname, "src/lib"),
                '$pages': resolve(__dirname, "src/pages"),
                '$stores': resolve(__dirname, "src/stores"),
                '$types': resolve(__dirname, "src/types"),
                // This Rollup aliases are extracted from @esbuild-plugins/node-modules-polyfill,
                // see https://github.com/remorses/esbuild-plugins/blob/master/node-modules-polyfill/src/polyfills.ts
                // process and buffer are excluded because already managed
                // by node-globals-polyfill
                util: 'rollup-plugin-node-polyfills/polyfills/util',
                sys: 'util',
                events: 'rollup-plugin-node-polyfills/polyfills/events',
                stream: 'rollup-plugin-node-polyfills/polyfills/stream',
                path: 'rollup-plugin-node-polyfills/polyfills/path',
                querystring: 'rollup-plugin-node-polyfills/polyfills/qs',
                punycode: 'rollup-plugin-node-polyfills/polyfills/punycode',
                url: 'rollup-plugin-node-polyfills/polyfills/url',
                buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
                string_decoder:
                    'rollup-plugin-node-polyfills/polyfills/string-decoder',
                http: 'rollup-plugin-node-polyfills/polyfills/http',
                https: 'rollup-plugin-node-polyfills/polyfills/http',
                os: 'rollup-plugin-node-polyfills/polyfills/os',
                assert: 'rollup-plugin-node-polyfills/polyfills/assert',
                constants: 'rollup-plugin-node-polyfills/polyfills/constants',
                _stream_duplex:
                    'rollup-plugin-node-polyfills/polyfills/readable-stream/duplex',
                _stream_passthrough:
                    'rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough',
                _stream_readable:
                    'rollup-plugin-node-polyfills/polyfills/readable-stream/readable',
                _stream_writable:
                    'rollup-plugin-node-polyfills/polyfills/readable-stream/writable',
                _stream_transform:
                    'rollup-plugin-node-polyfills/polyfills/readable-stream/transform',
                timers: 'rollup-plugin-node-polyfills/polyfills/timers',
                console: 'rollup-plugin-node-polyfills/polyfills/console',
                vm: 'rollup-plugin-node-polyfills/polyfills/vm',
                zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
                tty: 'rollup-plugin-node-polyfills/polyfills/tty',
                domain: 'rollup-plugin-node-polyfills/polyfills/domain',
            },
        },
        optimizeDeps: {
            esbuildOptions: {
                // Node.js global to browser globalThis
                define: {
                    global: 'globalThis'
                },
                // Enable esbuild polyfill plugins
                plugins: [
                    NodeGlobalsPolyfillPlugin({
                        process: true,
                        buffer: true
                    }),
                    NodeModulesPolyfillPlugin()
                ]
            }
        },
        plugins: [react()],
        build: {
            outDir: process.env.BUILD_PATH || 'build',
            rollupOptions: {
                plugins: [rollupNodePolyFill()],
                input: {
                    app: './index.html',
                    'service-worker': 'src/service-worker.js'
                },
                output: {
                    entryFileNames: assetInfo =>
                        assetInfo.name === 'service-worker'
                            ? 'service-worker.js'           
                            : 'assets/[name]-[hash].js'
                }
            },
            define: {
                "process.env.NODE_ENV": `"${mode}"`,
            }
        }
    })
}
export default vite
