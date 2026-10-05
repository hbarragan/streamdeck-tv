import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const embedded = process.argv.includes('--include-credentials');
const values = embedded ? parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')) : {};
if (embedded && (!values.TMDB_TOKEN || !values.PLEX_TOKEN || !values.PLEX_URL || !values.PLEX_SERVER_ID)) {
  throw new Error('Faltan las credenciales necesarias para la APK personal.');
}
const config = { apiBase: process.env.STREAMDECK_API_BASE || 'https://streamdeck-tv.vercel.app',
  tmdbToken: values.TMDB_TOKEN || '', plexToken: values.PLEX_TOKEN || '',
  plexUrl: values.PLEX_URL || '', plexServerId: values.PLEX_SERVER_ID || '',
  plexLibraryIds: values.PLEX_LIBRARY_IDS || '1,2', plexServerName: values.PLEX_SERVER_NAME || 'Plex' };
writeFileSync(new URL('../android/app/src/main/assets/native-config.json', import.meta.url), JSON.stringify(config));
console.log(embedded ? 'Configuración personal y credenciales incluidas en los assets nativos.' : 'Conexión a Vercel incluida, sin credenciales.');
