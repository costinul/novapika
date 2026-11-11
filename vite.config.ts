import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// `npm run dev` serves HTTPS on the local network so the headset can connect
// (WebXR needs a secure context). `npm run dev:local` serves plain HTTP on
// localhost for desktop work. The certificate comes from `npm run cert`.
export default defineConfig(({ mode }) => {
  const haveCert = existsSync('.cert/key.pem') && existsSync('.cert/cert.pem');
  const https =
    mode !== 'desktop' && haveCert
      ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
      : undefined;
  return {
    // The tunnel hosts let the dev server be reached through cloudflared or
    // ngrok, for when the headset cannot reach this PC over the local network.
    server: { https, allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'] },
    preview: { https },
    build: { target: 'es2022' },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
