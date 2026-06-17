const { withGradleProperties } = require('expo/config-plugins');

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }

  properties.push({ type: 'property', key, value });
}

function applyLocalAndroidBuildProperties(properties, options = {}) {
  const architectures = options.reactNativeArchitectures || process.env.SHINSA_ANDROID_ARCHITECTURES;
  const workerLimit = options.gradleWorkersMax || process.env.SHINSA_GRADLE_WORKERS_MAX;
  const minSdkVersion = options.minSdkVersion || process.env.SHINSA_ANDROID_MIN_SDK_VERSION || '26';

  if (architectures) {
    upsertGradleProperty(properties, 'reactNativeArchitectures', architectures);
  }

  if (workerLimit) {
    upsertGradleProperty(properties, 'org.gradle.workers.max', workerLimit);
  }

  upsertGradleProperty(properties, 'android.minSdkVersion', String(minSdkVersion));
}

module.exports = function withLocalAndroidBuildProperties(config, options = {}) {
  return withGradleProperties(config, (cfg) => {
    applyLocalAndroidBuildProperties(cfg.modResults, options);
    return cfg;
  });
};

module.exports.applyLocalAndroidBuildProperties = applyLocalAndroidBuildProperties;
module.exports.upsertGradleProperty = upsertGradleProperty;
