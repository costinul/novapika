// Creates a self-signed certificate in .cert/ for the HTTPS dev server.
// Needs openssl (ships with Git for Windows).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const candidates = [
  'openssl',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
];
const openssl = candidates.find(
  (c) => c === 'openssl' ? spawnSync(c, ['version']).status === 0 : existsSync(c),
);
if (!openssl) {
  console.error('openssl not found. Install Git for Windows or add openssl to PATH.');
  process.exit(1);
}

mkdirSync('.cert', { recursive: true });
const result = spawnSync(
  openssl,
  [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', '.cert/key.pem', '-out', '.cert/cert.pem',
    '-days', '365', '-subj', '/CN=novapika-dev',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
