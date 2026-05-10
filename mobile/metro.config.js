const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the shared/ folder so changes there are picked up by Metro.
config.watchFolders = [path.resolve(workspaceRoot, 'shared')];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Wire react-native-svg-transformer so .svg imports become React components.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = config;
