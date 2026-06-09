// Config plugin for react-native-health-connect (Android heart-rate capture).
// The android/ dir is gitignored + prebuild-regenerated, so every native
// change must flow through here. Does the three things the library's bare-RN
// install guide requires (we don't use its shipped app.plugin.js — it blindly
// pushes a duplicate intent-filter on every prebuild; this one is idempotent):
//
//   1. MainActivity: register the HealthConnectPermissionDelegate so the
//      permission-request activity contract can deliver results back to JS.
//   2. Manifest: ACTION_SHOW_PERMISSIONS_RATIONALE intent-filter on
//      MainActivity (Android ≤13 — fired when the user taps "privacy policy"
//      on the Health Connect permission sheet).
//   3. Manifest: ViewPermissionUsageActivity alias (Android 14+, where Health
//      Connect is part of the OS and uses VIEW_PERMISSION_USAGE instead).
//
// The health read permissions themselves live in app.json android.permissions.

const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';
const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

function withHealthConnectMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes(DELEGATE_IMPORT)) {
      contents = contents.replace(
        /^(package [\w.]+)$/m,
        `$1\n\n${DELEGATE_IMPORT}`,
      );
    }
    if (!contents.includes(DELEGATE_CALL)) {
      // After super.onCreate(...) inside onCreate — the delegate registers an
      // ActivityResult contract, which must happen before RESUMED.
      contents = contents.replace(
        /(super\.onCreate\([^)]*\))/,
        `$1\n    ${DELEGATE_CALL}`,
      );
    }
    if (!contents.includes(DELEGATE_CALL)) {
      throw new Error('with-health-connect: could not inject the permission delegate into MainActivity');
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error('with-health-connect: no <application> in AndroidManifest');

    // 2. Rationale intent-filter on MainActivity (Android ≤13).
    const mainActivity = (app.activity || []).find(
      (a) => a.$?.['android:name'] === '.MainActivity',
    );
    if (!mainActivity) throw new Error('with-health-connect: .MainActivity not found');
    mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
    const hasRationale = mainActivity['intent-filter'].some((f) =>
      (f.action || []).some((a) => a.$?.['android:name'] === RATIONALE_ACTION),
    );
    if (!hasRationale) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': RATIONALE_ACTION } }],
      });
    }

    // 3. Android 14+ permission-usage alias.
    app['activity-alias'] = app['activity-alias'] || [];
    const hasAlias = app['activity-alias'].some(
      (a) => a.$?.['android:name'] === 'ViewPermissionUsageActivity',
    );
    if (!hasAlias) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }

    return cfg;
  });
}

module.exports = function withHealthConnect(config) {
  return withHealthConnectManifest(withHealthConnectMainActivity(config));
};
