package es.streamdeck.tv;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView web;
    private PlexNative plexNative;
    private final ExecutorService plexWorker = Executors.newSingleThreadExecutor();
    private boolean searchingPlex;
    private static final String HOST = "appassets.androidplatform.net";

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        plexNative = new PlexNative(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        web = new WebView(this);
        web.setBackgroundColor(0xff090b10);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        // Local HTTP Node servers are a supported Fire TV home-network setup.
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.addJavascriptInterface(new PlexBridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null;
                String file = uri.getPath().substring(1);
                if (!Arrays.asList("index.html", "app.js", "style.css", "icon.svg", "tmdb.svg").contains(file)) return new WebResourceResponse("text/plain", "UTF-8", null);
                String mime = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "image/svg+xml";
                try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(file)); }
                catch (IOException error) { return new WebResourceResponse("text/plain", "UTF-8", null); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { notifyError("No hay un navegador instalado para abrir el enlace."); }
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
        web.requestFocus();
    }

    private void notifyError(String message) {
        web.evaluateJavascript("window.streamdeckNativeError && window.streamdeckNativeError(" + org.json.JSONObject.quote(message) + ")", null);
    }
    public class PlexBridge {
        @JavascriptInterface public String getApiBase() { return plexNative.apiBase(); }
        @JavascriptInterface public void openPlexHome(String type) { openPlex(plexNative.home(type)); }
        @JavascriptInterface public void searchPlex(String title, String type, String tmdbId) {
            runOnUiThread(() -> {
                if (title == null || title.trim().isEmpty() || title.length() > 500) {
                    notifyError("El título de búsqueda no es válido."); return;
                }
                if (!Arrays.asList("tv", "movie").contains(type) || tmdbId == null || !tmdbId.matches("[0-9]+")) {
                    notifyError("El título de búsqueda no es válido."); return;
                }
                if (searchingPlex) return;
                try {
                    Intent search = new Intent(Intent.ACTION_SEARCH);
                    search.setPackage("com.plexapp.android");
                    search.putExtra(android.app.SearchManager.QUERY, title);
                    try { startActivity(search); return; } catch (android.content.ActivityNotFoundException ignored) { }
                    Intent launch = getPackageManager().getLeanbackLaunchIntentForPackage("com.plexapp.android");
                    if (launch == null) launch = getPackageManager().getLaunchIntentForPackage("com.plexapp.android");
                    if (launch == null) { notifyError("Instala Plex en el Fire TV para ver este título."); return; }
                    final Intent fallback = launch;
                    searchingPlex = true;
                    Toast.makeText(MainActivity.this, "Buscando «" + title + "» en tu servidor Plex…", Toast.LENGTH_SHORT).show();
                    plexWorker.execute(() -> {
                        String link = null;
                        try { link = plexNative.resolve(title, type, tmdbId); } catch (Exception ignored) { }
                        final String resolved = link;
                        runOnUiThread(() -> {
                            searchingPlex = false;
                            if (isFinishing() || isDestroyed()) return;
                            if (resolved != null) openPlex(resolved);
                            else {
                                Toast.makeText(MainActivity.this, "Busca «" + title + "» dentro de Plex.", Toast.LENGTH_LONG).show();
                                notifyError("No se pudo abrir una coincidencia única en tu servidor. Busca «" + title + "» dentro de Plex.");
                                try { startActivity(fallback); } catch (Exception error) { notifyError("No se pudo abrir Plex."); }
                            }
                        });
                    });
                } catch (Exception error) {
                    searchingPlex = false;
                    notifyError("No se pudo abrir Plex. Comprueba que esté instalado en el Fire TV.");
                }
            });
        }
        @JavascriptInterface public void openPlex(String link) {
            runOnUiThread(() -> {
                if (link != null && !link.isEmpty() && !link.matches("^plex://server://[A-Za-z0-9%_-]+/com\\.plexapp\\.plugins\\.library/library/(?:metadata/[0-9]+(?:/children|\\?autoPlay=1)?|sections/[0-9]+/all)$")) {
                    notifyError("El enlace de Plex no es válido."); return;
                }
                try {
                    if (link != null && !link.isEmpty()) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link));
                        intent.setPackage("com.plexapp.android");
                        intent.putExtra("android.intent.extra.START_PLAYBACK", link.endsWith("?autoPlay=1"));
                        try { startActivity(intent); return; } catch (android.content.ActivityNotFoundException ignored) { }
                    }
                    Intent launch = getPackageManager().getLeanbackLaunchIntentForPackage("com.plexapp.android");
                    if (launch == null) launch = getPackageManager().getLaunchIntentForPackage("com.plexapp.android");
                    if (launch != null) { startActivity(launch); if (link != null && !link.isEmpty()) notifyError("Esta versión de Plex no admite el enlace. Busca el título dentro de Plex."); }
                    else notifyError("Instala Plex en el Fire TV para reproducir este título.");
                } catch (Exception error) { notifyError("No se pudo abrir Plex. Comprueba que esté instalado."); }
            });
        }
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        String direction;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: direction = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: direction = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: direction = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: direction = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    String enterAction = event.getKeyCode() == KeyEvent.KEYCODE_ENTER ? "if(e.form)e.form.requestSubmit();return false;" : "e.focus();return true;";
                    web.evaluateJavascript("(function(){var e=document.activeElement;if(!e)return false;if(e.tagName==='INPUT'){" + enterAction + "}e.click();return false;})()", result -> {
                        if ("true".equals(result)) ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
                    });
                }
                return true;
            default: return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // Move the text caret horizontally without accidentally changing the selected control.
            web.evaluateJavascript("(function(){var e=document.activeElement,d='" + direction + "';if(e.tagName==='INPUT' && (d==='ArrowLeft'||d==='ArrowRight')){try{var p=Math.max(0,Math.min(e.value.length,e.selectionStart+(d==='ArrowLeft'?-1:1)));e.setSelectionRange(p,p);}catch(ignore){}return;}window.streamdeckRemote && window.streamdeckRemote(d);})()", null);
        }
        return true;
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.streamdeckBack ? window.streamdeckBack() : false", result -> { if (!"true".equals(result)) finish(); });
    }
    @Override protected void onDestroy() { plexWorker.shutdownNow(); web.removeJavascriptInterface("Android"); web.destroy(); super.onDestroy(); }
}
