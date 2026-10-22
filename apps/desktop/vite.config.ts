import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

const envDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, envDir, '');
  const host = env.WEB_HOST ?? '';
  const port = Number(env.WEB_PORT);
  if (command === 'serve' && (!host || !Number.isInteger(port))) {
    throw new Error('WEB_HOST y WEB_PORT deben estar definidos en .env');
  }

  return {
    plugins: [vue()],
    envDir,
    clearScreen: false,
    server: { host, port, strictPort: true },
    preview: { host, port, strictPort: true },
    // Desktop app loaded from disk: one chunk is fine (xterm alone is ~400 kB).
    build: { target: 'safari16', chunkSizeWarningLimit: 1000 },
  };
});
