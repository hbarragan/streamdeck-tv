import { ApiError } from './catalog.js';

export function plexLinks(serverId, ratingKey, type) {
  const id = encodeURIComponent(serverId), key = encodeURIComponent(ratingKey);
  return { nativeUrl: `plex://server://${id}/com.plexapp.plugins.library/library/metadata/${key}${type === 'show' ? '/children' : '?autoPlay=1'}`,
    webUrl: `https://app.plex.tv/desktop/#!/server/${id}/details?key=${encodeURIComponent('/library/metadata/' + ratingKey)}` };
}

export function createPlex(config, fetcher = fetch) {
  let index, pending, expires = 0;
  const configured = Boolean(config.url && config.token);
  const libraryIds = (config.libraryIds || '').split(',').map(x => x.trim()).filter(Boolean);
  function home(type = 'movie') {
    const section = type === 'tv' ? config.showLibraryId || libraryIds[1] || '2' : config.movieLibraryId || libraryIds[0] || '1';
    return { serverName: config.serverName || 'Plex',
      webUrl: config.homeUrl ? config.homeUrl.replace(/([?&]source=)[^&]+/, '$1' + section) : 'https://app.plex.tv/desktop/',
      nativeUrl: config.serverId ? `plex://server://${encodeURIComponent(config.serverId)}/com.plexapp.plugins.library/library/sections/${encodeURIComponent(section)}/all` : '' };
  }
  async function request(path, params = {}) {
    if (!configured) throw new ApiError(503, 'Configura tu servidor Plex en el archivo .env.');
    const url = new URL(path, config.url);
    url.search = new URLSearchParams(params);
    let response;
    try { response = await fetcher(url, { headers: { Accept: 'application/json', 'X-Plex-Token': config.token }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new ApiError(502, 'No se pudo conectar con tu servidor Plex.'); }
    if (!response.ok) throw new ApiError(502, 'Plex rechazó la conexión. Revisa su dirección y token.');
    try { return (await response.json()).MediaContainer; } catch { throw new ApiError(502, 'Plex devolvió una respuesta no compatible.'); }
  }
  async function buildIndex() {
    const [identity, sections] = await Promise.all([request('/identity'), request('/library/sections')]);
    const serverId = config.serverId || identity.machineIdentifier;
    if (!serverId) throw new ApiError(502, 'No se pudo identificar el servidor Plex.');
    if (config.serverId && identity.machineIdentifier !== config.serverId) throw new ApiError(502, 'La conexión Plex no corresponde al servidor seleccionado.');
    const entries = new Map();
    for (const section of sections.Directory || []) {
      if (!['movie', 'show'].includes(section.type)) continue;
      if (libraryIds.length && !libraryIds.includes(String(section.key))) continue;
      let start = 0;
      while (true) {
        const data = await request(`/library/sections/${encodeURIComponent(section.key)}/all`, {
          includeGuids: '1', 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': '200' });
        const items = data.Metadata || [];
        for (const item of items) {
          for (const guid of item.Guid || []) {
            if (!guid.id || !item.ratingKey) continue;
            const key = `${section.type}:${guid.id}`;
            if (!entries.has(key)) entries.set(key, { ratingKey: String(item.ratingKey), title: item.title, type: section.type });
          }
        }
        start += items.length;
        if (!items.length || start >= Number(data.totalSize ?? start)) break;
        if (start > 100000) throw new ApiError(502, 'La biblioteca Plex supera el límite de indexación de esta versión.');
      }
    }
    index = { entries, serverId }; expires = Date.now() + 300000;
    return index;
  }
  async function resolve(type, id, external = {}) {
    if (!configured) return { configured: false, found: false };
    if (!index || expires < Date.now()) {
      if (!pending) pending = buildIndex().finally(() => { pending = null; });
      await pending;
    }
    const kind = type === 'tv' ? 'show' : 'movie';
    const guids = [`tmdb://${id}`, ...(external.imdb ? [`imdb://${external.imdb}`] : []), ...(external.tvdb ? [`tvdb://${external.tvdb}`] : [])];
    const match = guids.map(g => index.entries.get(`${kind}:${g}`)).find(Boolean);
    if (!match) return { configured: true, found: false };
    return { configured: true, found: true, ...match, ...plexLinks(index.serverId, match.ratingKey, match.type) };
  }
  return { configured, resolve, home };
}
