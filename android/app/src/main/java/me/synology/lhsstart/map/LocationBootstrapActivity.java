package me.synology.lhsstart.map;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;

import java.util.List;
import java.util.Locale;

/**
 * Resolves Android location before opening the Trusted Web Activity. This avoids relying on
 * browser-to-app location delegation, which is inconsistent on some Samsung/Android versions.
 */
public class LocationBootstrapActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 5001;
    private static final long FRESH_LOCATION_MS = 2 * 60 * 1000L;
    private static final long LOCATION_TIMEOUT_MS = 6500L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private Location fallbackLocation;
    private LocationListener legacyListener;
    private CancellationSignal cancellationSignal;
    private boolean launched;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (hasLocationPermission()) {
            resolveLocationAndLaunch();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[] {
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.ACCESS_FINE_LOCATION
            }, LOCATION_PERMISSION_REQUEST);
        } else {
            launchMap(null);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST) return;
        if (hasLocationPermission()) resolveLocationAndLaunch();
        else launchMap(null);
    }

    private boolean hasLocationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveLocationAndLaunch() {
        fallbackLocation = bestLastKnownLocation();
        if (fallbackLocation != null
                && System.currentTimeMillis() - fallbackLocation.getTime() <= FRESH_LOCATION_MS) {
            launchMap(fallbackLocation);
            return;
        }
        String provider = firstEnabledProvider();
        if (provider == null) {
            launchMap(fallbackLocation);
            return;
        }
        handler.postDelayed(() -> launchMap(fallbackLocation), LOCATION_TIMEOUT_MS);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                cancellationSignal = new CancellationSignal();
                locationManager.getCurrentLocation(
                        provider,
                        cancellationSignal,
                        getMainExecutor(),
                        location -> launchMap(location != null ? location : fallbackLocation)
                );
            } else {
                legacyListener = new LocationListener() {
                    @Override public void onLocationChanged(Location location) { launchMap(location); }
                    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
                    @Override public void onProviderEnabled(String provider) { }
                    @Override public void onProviderDisabled(String provider) { }
                };
                locationManager.requestSingleUpdate(provider, legacyListener, Looper.getMainLooper());
            }
        } catch (SecurityException | IllegalArgumentException error) {
            launchMap(fallbackLocation);
        }
    }

    private String firstEnabledProvider() {
        if (locationManager == null) return null;
        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                return LocationManager.NETWORK_PROVIDER;
            }
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                return LocationManager.GPS_PROVIDER;
            }
        } catch (Exception ignored) { }
        return null;
    }

    private Location bestLastKnownLocation() {
        if (locationManager == null || !hasLocationPermission()) return null;
        Location best = null;
        try {
            List<String> providers = locationManager.getProviders(true);
            for (String provider : providers) {
                Location candidate = locationManager.getLastKnownLocation(provider);
                if (candidate == null) continue;
                if (best == null || candidate.getTime() > best.getTime()
                        || (candidate.getTime() == best.getTime() && candidate.getAccuracy() < best.getAccuracy())) {
                    best = candidate;
                }
            }
        } catch (SecurityException ignored) { }
        return best;
    }

    private Uri launchUri(Location location) {
        Uri incoming = getIntent() == null ? null : getIntent().getData();
        Uri base = incoming != null ? incoming : Uri.parse(getString(R.string.launchUrl));
        Uri.Builder builder = base.buildUpon();
        if (base.getQueryParameter("source") == null) builder.appendQueryParameter("source", "android");
        if (location != null) {
            builder.appendQueryParameter("native_lat", String.format(Locale.US, "%.7f", location.getLatitude()));
            builder.appendQueryParameter("native_lng", String.format(Locale.US, "%.7f", location.getLongitude()));
            builder.appendQueryParameter("native_accuracy", String.format(Locale.US, "%.1f", location.getAccuracy()));
            builder.appendQueryParameter("native_ts", String.valueOf(location.getTime()));
        }
        return builder.build();
    }

    private void launchMap(Location location) {
        if (launched) return;
        launched = true;
        handler.removeCallbacksAndMessages(null);
        if (cancellationSignal != null) cancellationSignal.cancel();
        if (legacyListener != null && locationManager != null) {
            try { locationManager.removeUpdates(legacyListener); } catch (SecurityException ignored) { }
        }
        Intent intent = new Intent(this, LauncherActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(launchUri(location));
        startActivity(intent);
        finish();
    }
}
