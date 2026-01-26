import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core']
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@clerk/nextjs': path.resolve(__dirname, 'shims/clerk-nextjs.tsx'),
          '@clerk/nextjs/server': path.resolve(__dirname, 'shims/clerk-nextjs-server.ts'),
          'next/link': path.resolve(__dirname, 'shims/next-link.tsx'),
          'next/image': path.resolve(__dirname, 'shims/next-image.tsx'),
          'next/navigation': path.resolve(__dirname, 'shims/next-navigation.tsx'),
          'next/font/google': path.resolve(__dirname, 'shims/next-font-google.ts'),
        }
      }
    };
});
