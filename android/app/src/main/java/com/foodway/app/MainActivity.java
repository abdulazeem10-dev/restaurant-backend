package com.foodway.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 7101;
    private static final int FILE_CHOOSER_REQUEST = 7102;
    private static final String HOME_URL = "https://appassets.androidplatform.net/customer/index.html";
    private static final String ALLOWED_HOST = "appassets.androidplatform.net";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(ALLOWED_HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " FoodwayAndroidApp/1.1");

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return interceptAppAsset(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return interceptAppAsset(Uri.parse(url));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                Uri originUri = Uri.parse(origin);
                if (!"https".equalsIgnoreCase(originUri.getScheme()) || !ALLOWED_HOST.equalsIgnoreCase(originUri.getHost())) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (hasLocationPermission()) callback.invoke(origin, true, false);
                else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION_REQUEST);
                }
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST); return true; }
                catch (ActivityNotFoundException exception) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        if (savedInstanceState == null) webView.loadUrl(HOME_URL);
        else webView.restoreState(savedInstanceState);
    }

    private WebResourceResponse interceptAppAsset(Uri uri) {
        if (!ALLOWED_HOST.equalsIgnoreCase(uri.getHost())) return null;
        return assetLoader.shouldInterceptRequest(uri);
    }

    private boolean handleUrl(Uri uri) {
        if ("https".equalsIgnoreCase(uri.getScheme()) && ALLOWED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (scheme.equals("https") || scheme.equals("http") || scheme.equals("tel") || scheme.equals("mailto")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException ignored) { Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show(); }
        }
        return true;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, hasLocationPermission(), false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileChooserCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) { webView.saveState(outState); super.onSaveInstanceState(outState); }
    @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (webView != null) webView.destroy(); super.onDestroy(); }
}
