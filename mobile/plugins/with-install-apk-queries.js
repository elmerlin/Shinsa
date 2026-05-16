/**
 * Config plugin: declare the AndroidManifest <queries> entry that lets
 * our in-app auto-updater hand the downloaded APK to the system installer
 * on Android 11+ (package visibility rules require an explicit query for
 * any intent we want to resolve).
 *
 * The REQUEST_INSTALL_PACKAGES permission itself goes through app.json's
 * `android.permissions` field — Expo handles that natively. This plugin
 * just adds the <queries><intent>vnd.android.package-archive</intent></queries>
 * block which there's no first-class expo config option for.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGE_ARCHIVE_MIME = 'application/vnd.android.package-archive';

module.exports = function withInstallApkQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.queries) manifest.queries = [{}];
    const queries = manifest.queries[0];
    if (!queries.intent) queries.intent = [];

    const alreadyDeclared = queries.intent.some((intent) =>
      (intent.data || []).some(
        (data) => data?.$?.['android:mimeType'] === PACKAGE_ARCHIVE_MIME,
      ),
    );

    if (!alreadyDeclared) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:mimeType': PACKAGE_ARCHIVE_MIME } }],
      });
    }
    return cfg;
  });
};
