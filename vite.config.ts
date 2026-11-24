import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves this project under /nexus-test/ (see .github/workflows/pages.yml).
  plugins: [react()],
  base: '/nexus-test/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
