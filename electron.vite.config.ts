import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Vite's dev server serves some files without the `application/wasm` MIME type,
// which breaks `WebAssembly.instantiateStreaming` (used by matrix-sdk-crypto-wasm).
function wasmMimePlugin(): Plugin {
  return {
    name: 'wasm-mime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /\.wasm(\?|$)/.test(req.url)) {
          res.setHeader('Content-Type', 'application/wasm');
        }
        next();
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
        '@': resolve('src/renderer'),
      },
    },
    optimizeDeps: {
      // matrix-sdk-crypto-wasm loads its WASM via `new URL('./*.wasm', import.meta.url)`.
      // Vite's dep pre-bundler would relocate the JS to .vite/deps/ and break the
      // relative URL, so we keep the crypto package out of pre-bundling. It must be
      // installed as a direct dep so pnpm hoists it into the top-level node_modules.
      exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
      esbuildOptions: {
        // Keep `@matrix-org/matrix-sdk-crypto-wasm` external during matrix-js-sdk's
        // pre-bundling — esbuild would otherwise inline it and break the relative URL.
        plugins: [
          {
            name: 'mark-matrix-crypto-wasm-external',
            setup(build) {
              build.onResolve({ filter: /^@matrix-org\/matrix-sdk-crypto-wasm$/ }, (args) => ({
                path: args.path,
                external: true,
              }));
            },
          },
        ],
      },
    },
    plugins: [react(), wasmMimePlugin()],
  },
});
