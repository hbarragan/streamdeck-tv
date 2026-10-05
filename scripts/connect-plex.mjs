import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const envFile = process.env.STREAMDECK_ENV_FILE ? pathToFileURL(resolve(process.env.STREAMDECK_ENV_FILE)) : new URL('.env', root);
let settings = {};
try { settings = parseEnv(await readFile(envFile, 'utf8')); } catch { }
const targetId = process.env.PLEX_SERVER_ID || settings.PLEX_SERVER_ID || '';
const homeUrl = `https://app.plex.tv/desktop/#!/media/${targetId}/com.plexapp.plugins.library?source=1`;
let client;
try { client = JSON.parse(await readFile(new URL('.plex-client.json', root), 'utf8')); }
catch { client = { id: randomUUID() }; await writeFile(new URL('.plex-client.json', root), JSON.stringify(client), { mode: 0o600 }); }
const headers = { Accept: 'application/json', 'X-Plex-Client-Identifier': client.id, 'X-Plex-Product': 'StreamDeck TV',
  'X-Plex-Version': '1.0.0', 'X-Plex-Platform': 'Node.js', 'X-Plex-Device-Name': 'StreamDeck TV' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Plex devolvió HTTP ${response.status}.`);
  return response.json();
}
function setEnv(text, key, value) {
  const line = `${key}=${JSON.stringify(String(value))}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, () => line) : text.trimEnd() + '\n' + line + '\n';
}
try {
  if (process.argv.includes('--start')) {
    const pin = await request('https://plex.tv/api/v2/pins?strong=true', { method: 'POST' });
    await writeFile(new URL('.plex-login.json', root), JSON.stringify({ id: pin.id, code: pin.code }), { mode: 0o600 });
    const params = new URLSearchParams({ clientID: client.id, code: pin.code, 'context[device][product]': 'StreamDeck TV',
      'context[device][device]': 'StreamDeck TV' });
    console.log('https://app.plex.tv/auth#?' + params);
  } else if (process.argv.includes('--finish')) {
    if (!targetId) throw new Error('Configura PLEX_SERVER_ID para seleccionar tu servidor.');
    const pin = JSON.parse(await readFile(new URL('.plex-login.json', root), 'utf8'));
    const result = await request(`https://plex.tv/api/v2/pins/${pin.id}?code=${encodeURIComponent(pin.code)}`);
    if (!result.authToken) { console.log('PENDING: completa la autorización de Plex en el navegador.'); process.exitCode = 2; }
    else {
      const resources = await request('https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { headers: { 'X-Plex-Token': result.authToken } });
      const resource = resources.find(r => r.clientIdentifier === targetId && r.provides?.includes('server'));
      if (!resource?.accessToken) throw new Error('Tu cuenta no tiene acceso API al servidor seleccionado.');
      // Use the server-specific token, not an account-wide credential.
      let selected, sectionData;
      const connections = (resource.connections || []).filter(c => c.uri?.startsWith('https://'))
        .sort((a, b) => Number(a.relay) - Number(b.relay) || Number(b.local) - Number(a.local));
      for (const connection of connections) {
        try {
          const sections = await request(new URL('/library/sections', connection.uri), { headers: { 'X-Plex-Token': resource.accessToken } });
          const list = sections.MediaContainer?.Directory || [];
          if (list.some(s => String(s.key) === '1' && s.type === 'movie') && list.some(s => String(s.key) === '2' && s.type === 'show')) {
            selected = connection.uri; sectionData = list.filter(s => ['1', '2'].includes(String(s.key))); break;
          }
        } catch { /* Try Plex's next advertised secure connection. */ }
      }
      if (!selected) throw new Error('No hay una conexión HTTPS accesible con las bibliotecas seleccionadas.');
      let env = await readFile(envFile, 'utf8');
      for (const [key, value] of Object.entries({ PLEX_URL: selected, PLEX_TOKEN: resource.accessToken, PLEX_SERVER_ID: targetId,
        PLEX_LIBRARY_IDS: '1,2', PLEX_HOME_URL: homeUrl, PLEX_SERVER_NAME: resource.name })) env = setEnv(env, key, value);
      await writeFile(envFile, env, { mode: 0o600 });
      await unlink(new URL('.plex-login.json', root));
      console.log(JSON.stringify({ connected: true, server: resource.name, libraries: sectionData.map(s => ({ id: s.key, title: s.title, type: s.type })), credentialsSaved: true }));
    }
  } else console.log('Uso: node scripts/connect-plex.mjs --start | --finish');
} catch { console.error('No se pudo completar la conexión de Plex. La autorización puede haber caducado, el servidor estar desconectado o las bibliotecas no estar disponibles.'); process.exitCode = 1; }
