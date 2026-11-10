/**
 * Expo's Babel preset. Without this file Metro has no transform for .tsx/JSX in
 * this app and `expo export` fails before it produces a bundle.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
