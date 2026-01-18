import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: [
          'kohost-beta.kolab.top'
        ],
        // Proxy untuk API dan WebSocket
        proxy: {
          '/api': {
            target: 'http://localhost:5000',
            changeOrigin: true
          },
          '/socket.io': {
            target: 'http://localhost:5000',
            ws: true, // Enable WebSocket proxying
            changeOrigin: true
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});