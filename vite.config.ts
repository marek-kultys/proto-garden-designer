import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inlineEverything } from './build/inline';

// Two build targets share one source tree:
//   `vite build`                -> normal multi-asset build
//   `SINGLEFILE=1 vite build`   -> one self-contained dist/index.html with no
//                                  external requests, for sharing with testers.
//
// The inlining is ours, in build/inline.ts, rather than vite-plugin-singlefile:
// that dependency carried three high advisories with no upstream fix, for forty
// lines of work. See the note at the top of that file.
const singleFile = process.env.SINGLEFILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [inlineEverything()] : [])],
  build: {
    target: 'es2020',
    assetsInlineLimit: singleFile ? 100_000_000 : 4096,
  },
});
