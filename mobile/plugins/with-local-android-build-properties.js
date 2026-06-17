const { withGradleProperties } = require('expo/config-plugins');

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }

  properties.push({ type: 'property', key, value });
}

module.exports = function withLocalAndroidBuildProperties(config, options = {}) {
  return withGradleProperties(config, (cfg) => {
    const architectures = options.reactNativeArchitectures || process.env.SHINSA_ANDROID_ARCHITECTURES;
    const workerLimit = options.gradleWorkersMax || process.env.SHINSA_GRADLE_WORKERS_MAX;

    if (architectures) {
      upsertGradleProperty(cfg.modResults, 'reactNativeArchitectures', architectures);
    }

    if (workerLimit) {
      upsertGradleProperty(cfg.modResults, 'org.gradle.workers.max', workerLimit);
    }

    return cfg;
  });
};

module.exports.upsertGradleProperty = upsertGradleProperty;
