import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// `npm run dev` serves HTTPS on the local network so the headset can connect
// (WebXR needs a secure context). `npm run dev:local` serves plain HTTP on
// localhost for desktop work. The certificate comes from `npm run cert`.
// `ws` passes the lobby's WebSocket through as well.
const API_PROXY = { '/api': { target: 'http://localhost:8787', ws: true } };

export default defineConfig(({ mode }) => {
  const haveCert = existsSync('.cert/key.pem') && existsSync('.cert/cert.pem');
  const https =
    mode !== 'desktop' && haveCert
      ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
      : undefined;
  return {
    // The tunnel hosts let the dev server be reached through cloudflared or
    // ngrok, for when the headset cannot reach this PC over the local network.
    // The API runs beside the dev server with `npm run dev:api`. Without it
    // the game still plays, signed out.
    server: { https, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'], proxy: API_PROXY },
    preview: { https, proxy: API_PROXY },
    // Two pages: the game, and the owner's admin page.
    build: { target: 'es2022', rolldownOptions: { input: ['index.html', 'admin.html'] } },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
