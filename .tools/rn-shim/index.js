/**
 * Test shim for `react-native` — NOT a reimplementation.
 *
 * Lives outside `node_modules` on purpose: an earlier copy was placed in
 * `.tools/node_modules/react-native` and an unrelated `npm install` pruned it as an
 * extraneous package, which silently broke the renderer tests. It is now referenced
 * from `tsconfig.test.json` via a `react-native` path mapping, so installing packages
 * can no longer remove it.
 *
 * The four primitives used by apps/mobile/src/components are mapped to host
 * components so React 18 can build and mount a real element tree.
 * `StyleSheet.create` passes style objects through unchanged.
 *
 * What this proves: the components mount, props are read, conditional branches are
 * taken, rendered text matches the policy layer.
 * What it does NOT prove: layout, styling, gestures, accessibility bridging, native
 * behaviour. There is no NativeModule here.
 */
const React = require('react');

const host = (name) =>
  function Shim(props) {
    return React.createElement(name, props, props.children);
  };

const flatten = (style) => {
  const list = Array.isArray(style) ? style : [style];
  return list.reduce((acc, item) => Object.assign(acc, item || {}), {});
};

module.exports = {
  View: host('View'),
  Text: host('Text'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  ScrollView: host('ScrollView'),
  StyleSheet: {
    create: (sheet) => sheet,
    flatten,
    compose: (a, b) => Object.assign({}, flatten(a), flatten(b)),
  },
};
