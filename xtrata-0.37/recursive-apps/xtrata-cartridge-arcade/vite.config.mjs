import { defineConfig } from 'vite';

const HOST = '127.0.0.1';
const DEV_PORT = 4174;
const PREVIEW_PORT = 4175;

export default defineConfig({
  appType: 'mpa',
  server: {
    host: HOST,
    port: DEV_PORT,
    strictPort: true,
    open: '/modules/local-runner.html'
  },
  preview: {
    host: HOST,
    port: PREVIEW_PORT,
    strictPort: true,
    open: '/modules/local-runner.html'
  }
});
