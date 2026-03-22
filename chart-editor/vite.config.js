import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/charting/',
  server: {
    port: 5174,
    proxy: {
      '/jackets': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
