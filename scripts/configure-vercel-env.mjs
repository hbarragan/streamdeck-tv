import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const values = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const allowed = ['TMDB_TOKEN', 'PLEX_URL', 'PLEX_TOKEN', 'PLEX_SERVER_ID', 'PLEX_LIBRARY_IDS', 'PLEX_HOME_URL', 'PLEX_SERVER_NAME'];
const childEnv = { ...process.env };
delete childEnv.VERCEL_TOKEN;
for (const key of allowed) {
  if (!values[key]) continue;
  const command = `vercel env add ${key} production --sensitive --force --yes`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: new URL('../', import.meta.url), env: childEnv,
    input: values[key], encoding: 'utf8', windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`No se pudo configurar ${key} en Vercel.`);
    process.exit(1);
  }
  console.log(`${key}: configurada en producción.`);
}
