import { createHandler } from '../server/app.js';

export default createHandler({
  tmdbToken: process.env.TMDB_TOKEN,
  plexUrl: process.env.PLEX_URL,
  plexToken: process.env.PLEX_TOKEN,
  plexServerId: process.env.PLEX_SERVER_ID,
  plexLibraryIds: process.env.PLEX_LIBRARY_IDS,
  plexHomeUrl: process.env.PLEX_HOME_URL,
  plexServerName: process.env.PLEX_SERVER_NAME,
});
