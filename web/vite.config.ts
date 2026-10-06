import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages는 /<저장소명>/ 하위 경로에서 서비스되므로 빌드 시 VITE_BASE로 지정
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
