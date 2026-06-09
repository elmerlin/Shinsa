// @kingstinct/react-native-healthkit is iOS-only (HealthKit has no Android
// equivalent in this lib). Disable its Android autolinking so the Android
// build doesn't try to compile a non-existent Android implementation. The JS
// side is platform-split (healthkit.ios.ts vs healthkit.ts stub), so Android
// never imports the native module either.
module.exports = {
  dependencies: {
    '@kingstinct/react-native-healthkit': {
      platforms: {
        android: null,
      },
    },
  },
};
