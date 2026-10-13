// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports `wa-sqlite.wasm` as a module and expects
// Metro to serve it as an asset URI (`locateFile: () => wasmModule`).
// Without this, `expo start --web` / `expo export --platform web` fail with
// "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm".
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
