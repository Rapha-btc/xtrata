import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hiroApiKey = env.HIRO_API_KEY || env.VITE_HIRO_API_KEY;
  const proxyHeaders = hiroApiKey ? { 'x-hiro-api-key': hiroApiKey } : {};
  const hasHiroApiKey = Boolean(hiroApiKey);

  return {
    plugins: [react()],
    define: {
      __XSTRATA_HAS_HIRO_KEY__: JSON.stringify(hasHiroApiKey)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            tanstack: ['@tanstack/react-query'],
            stacks: ['@stacks/connect', '@stacks/network', '@stacks/transactions'],
            crypto: ['@noble/hashes']
          }
        }
      }
    },
    server: {
      proxy: {
        '/hiro/testnet': {
          target: 'https://api.testnet.hiro.so',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hiro\/testnet/, ''),
          headers: proxyHeaders
        },
        '/hiro/mainnet': {
          target: 'https://api.mainnet.hiro.so',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hiro\/mainnet/, ''),
          headers: proxyHeaders
        }
      }
    }
  };
});
