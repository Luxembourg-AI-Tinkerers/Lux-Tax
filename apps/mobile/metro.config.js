/**
 * Metro configuration for the monorepo.
 *
 * `@luxtax/*` are workspace packages that live outside this app. Metro only
 * serves files under its project root, so without `watchFolders` every import of
 * `@luxtax/contracts` fails with "could not be found within the project or in
 * these directories".
 *
 * `node_modules` is deliberately *not* added as a watch folder: Metro already
 * watches the project's own `node_modules`, and adding it again (it can be a
 * junction in this workspace) makes Metro build an empty file map and fail with
 * "Cannot read properties of undefined (reading 'get')".
 *
 * `LUXTAX_PACKAGES_DIR` exists for an out-of-tree build sandbox; in the repo the
 * default (../../packages) is correct.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const packagesRoot = process.env.LUXTAX_PACKAGES_DIR
  ? path.resolve(process.env.LUXTAX_PACKAGES_DIR)
  : path.resolve(projectRoot, '..', '..', 'packages');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [packagesRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
