/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub project pages serve the site under /<repo>/, and the path is case-sensitive.
export default defineConfig({
  base: '/DNS-report-card/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
