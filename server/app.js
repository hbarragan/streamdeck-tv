import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog, ApiError } from './catalog.js';
import { createPlex } from './plex.js';
import { createNetflixRanks } from './netflix.js';

const publicDir = () => fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/icon.svg': ['icon.svg', 'image/svg+xml'], '/tmdb.svg': ['tmdb.svg', 'image/svg+xml'] };
export function createHandler(config = {}, fetcher = fetch) {
  const catalog = createCatalog(config.tmdbToken, fetcher);
  const netflix = createNetflixRanks(catalog, fetcher);
  const plex = createPlex({ url: config.plexUrl, token: config.plexToken, serverId: config.plexServerId,
    libraryIds: config.plexLibraryIds, homeUrl: config.plexHomeUrl, serverName: config.plexServerName }, fetcher);
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    // The APK loads bundled local assets; only those and the same origin can read the API.
    if (['null', 'https://appassets.androidplatform.net'].includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET' }); return res.end(); }
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      if (req.method !== 'GET') throw new ApiError(405, 'Método no permitido.');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/status') return json(200, { tmdbConfigured: Boolean(config.tmdbToken), plexConfigured: plex.configured, region: 'ES',
          ...(config.plexServerName ? { plexServerName: config.plexServerName } : {}) });
        if (url.pathname === '/api/providers') return json(200, { providers: await catalog.providers() });
        if (url.pathname === '/api/plex/home') return json(200, plex.home(url.searchParams.get('type')));
        const provider = url.searchParams.get('provider');
        const type = url.searchParams.get('type') || 'tv';
        if (!['movie', 'tv'].includes(type)) throw new ApiError(400, 'Tipo de contenido no válido.');
        if (url.pathname === '/api/netflix/top10') return json(200, await netflix.ranks(type));
        const page = Number(url.searchParams.get('page') || 1);
        if (!Number.isInteger(page) || page < 1 || page > 500) throw new ApiError(400, 'Página no válida.');
        if (url.pathname === '/api/catalog') return json(200, await catalog.discover(provider, type, url.searchParams.get('sort'), page));
        if (url.pathname === '/api/shelves') return json(200, { shelves: await catalog.shelves(provider, type) });
        if (url.pathname === '/api/search') {
          const query = (url.searchParams.get('q') || '').trim();
          if (query.length < 2 || query.length > 120) throw new ApiError(400, 'Escribe entre 2 y 120 caracteres.');
          return json(200, await catalog.search(provider, type, query, page));
        }
        if (['/api/details', '/api/plex'].includes(url.pathname)) {
          const id = url.searchParams.get('id');
          if (!/^\d+$/.test(id || '')) throw new ApiError(400, 'Identificador no válido.');
          const details = await catalog.details(provider, type, id);
          return json(200, url.pathname === '/api/plex' ? await plex.resolve(type, id, details) : details);
        }
        throw new ApiError(404, 'Ruta no encontrada.');
      }
      const asset = assets[url.pathname];
      if (!asset) throw new ApiError(404, 'Página no encontrada.');
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://image.tmdb.org; connect-src 'self' http: https:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(config.readAsset ? await config.readAsset(asset[0]) : await readFile(publicDir() + asset[0]));
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : 'Ha ocurrido un error en el servidor.' }); }
  };
}
export function createApp(config = {}, fetcher = fetch) {
  return createServer(createHandler(config, fetcher));
}
