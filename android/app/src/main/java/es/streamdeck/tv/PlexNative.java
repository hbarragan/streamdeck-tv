package es.streamdeck.tv;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;

/** Credentials stay in native assets and are never returned to the WebView. */
final class PlexNative {
    private final JSONObject config;
    PlexNative(Context context) {
        JSONObject loaded;
        try (InputStream input = context.getAssets().open("native-config.json")) {
            loaded = new JSONObject(read(input));
        } catch (Exception error) { loaded = new JSONObject(); }
        config = loaded;
    }
    String apiBase() { return config.optString("apiBase", "https://streamdeck-tv.vercel.app"); }
    String home(String type) {
        String server = config.optString("plexServerId");
        if (!server.matches("[A-Za-z0-9_-]+")) return "";
        String section = section(type);
        return "plex://server://" + server + "/com.plexapp.plugins.library/library/sections/" + section + "/all";
    }
    private String section(String type) {
        String[] ids = config.optString("plexLibraryIds", "1,2").split(",");
        String id = "tv".equals(type) ? (ids.length > 1 ? ids[1].trim() : "2") : ids[0].trim();
        if (!id.matches("[0-9]+")) throw new IllegalArgumentException("Biblioteca no válida");
        return id;
    }
    String resolve(String title, String type, String tmdbId) throws Exception {
        String server = config.optString("plexServerId");
        if (!server.matches("[A-Za-z0-9_-]+") || config.optString("plexToken").isEmpty()) return null;
        JSONObject identity = request("/identity");
        if (!server.equals(identity.optString("machineIdentifier"))) throw new IllegalStateException("Servidor diferente");
        String kind = "tv".equals(type) ? "show" : "movie";
        JSONObject data = request("/library/sections/" + section(type) + "/all?title=" + Uri.encode(title)
            + "&includeGuids=1&X-Plex-Container-Size=200");
        JSONArray items = data.optJSONArray("Metadata");
        if (items == null) return null;
        String nameMatch = null;
        int matches = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            if (!kind.equals(item.optString("type"))) continue;
            String key = item.optString("ratingKey");
            if (!key.matches("[0-9]+")) continue;
            JSONArray guids = item.optJSONArray("Guid");
            if (guids != null && tmdbId.matches("[0-9]+")) {
                for (int g = 0; g < guids.length(); g++) {
                    if (("tmdb://" + tmdbId).equals(guids.getJSONObject(g).optString("id"))) return link(server, key, type);
                }
            }
            if (normal(title).equals(normal(item.optString("title")))) { nameMatch = key; matches++; }
        }
        // Never choose arbitrarily between remakes or duplicate titles.
        if (data.optInt("totalSize", items.length()) > items.length()) return null;
        return matches == 1 ? link(server, nameMatch, type) : null;
    }
    private String link(String server, String key, String type) {
        return "plex://server://" + server + "/com.plexapp.plugins.library/library/metadata/" + key
            + ("tv".equals(type) ? "/children" : "?autoPlay=1");
    }
    private JSONObject request(String path) throws Exception {
        URL base = new URL(config.optString("plexUrl"));
        if (!"https".equals(base.getProtocol())) throw new IllegalStateException("Plex requiere HTTPS");
        HttpURLConnection connection = (HttpURLConnection)new URL(base, path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(7000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-Plex-Token", config.optString("plexToken"));
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("Plex no disponible");
            try (InputStream input = connection.getInputStream()) {
                return new JSONObject(read(input)).getJSONObject("MediaContainer");
            }
        } finally { connection.disconnect(); }
    }
    private static String read(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > 4 * 1024 * 1024) throw new IllegalStateException("Respuesta demasiado grande");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }
    private static String normal(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }
}
