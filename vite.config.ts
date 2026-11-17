import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // L'interface parle au moteur local par /api (même origine, rien d'exposé au réseau).
    proxy: { '/api': 'http://127.0.0.1:4317' },
    watch: { ignored: ['**/.lba/**'] },
  },
});
