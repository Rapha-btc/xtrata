import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hiroApiKey = env.HIRO_API_KEY || env.VITE_HIRO_API_KEY;
  const proxyHeaders: Record<string, string> = hiroApiKey
    ? { 'x-hiro-api-key': hiroApiKey }
    : {};
  const hasHiroApiKey = Boolean(hiroApiKey);
  const bnsApiBase =
    env.VITE_BNS_API_MAINNET || env.VITE_BNS_API_BASE || 'https://api.bns.xyz';
  const bnsV2MainnetApiBase =
    env.VITE_BNSV2_API_BASE_MAINNET ||
    env.VITE_BNSV2_API_BASE ||
    'https://api.bnsv2.com';
  const bnsV2TestnetApiBase =
    env.VITE_BNSV2_API_BASE_TESTNET ||
    env.VITE_BNSV2_API_BASE ||
    'https://api.bnsv2.com/testnet';

  return {
    plugins: [react()],
    define: {
      __XSTRATA_HAS_HIRO_KEY__: JSON.stringify(hasHiroApiKey)
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), 'index.html'),
          workspace: resolve(process.cwd(), 'workspace.html'),
          lab26: resolve(process.cwd(), 'lab26/index.html')
        },
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
        '/bnsv2/mainnet': {
          target: bnsV2MainnetApiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bnsv2\/mainnet/, '')
        },
        '/bnsv2/testnet': {
          target: bnsV2TestnetApiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bnsv2\/testnet/, '')
        },
        '/bns': {
          target: bnsApiBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bns/, '')
        },
        '/rpc-testnet': {
          target: 'https://api.testnet.hiro.so',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc-testnet/, ''),
          headers: proxyHeaders
        },
        '/rpc': {
          target: 'https://api.mainnet.hiro.so',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc/, ''),
          headers: proxyHeaders
        },
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
