import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works both at a domain root and under a
  // sub-path (e.g. GitHub Pages project sites).
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
