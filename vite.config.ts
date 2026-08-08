import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two build targets share one source tree:
//   `vite build`                -> normal multi-asset build
//   `SINGLEFILE=1 vite build`   -> one self-contained dist/index.html with no
//                                  external requests, for sharing with testers.
const singleFile = process.env.SINGLEFILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  build: {
    target: 'es2020',
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
  },
});
