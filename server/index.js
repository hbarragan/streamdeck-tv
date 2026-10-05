import { createApp } from './app.js';
const port = Number(process.env.PORT || 3477);
createApp({ tmdbToken: process.env.TMDB_TOKEN, plexUrl: process.env.PLEX_URL, plexToken: process.env.PLEX_TOKEN,
  plexServerId: process.env.PLEX_SERVER_ID, plexLibraryIds: process.env.PLEX_LIBRARY_IDS,
  plexHomeUrl: process.env.PLEX_HOME_URL, plexServerName: process.env.PLEX_SERVER_NAME }).listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`StreamDeck disponible en http://localhost:${port}. Usa la IP de este equipo para conectar el Fire TV.`);
});
