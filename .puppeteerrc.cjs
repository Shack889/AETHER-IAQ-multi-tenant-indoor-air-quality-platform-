const { join } = require('path');

/**
 * Pin Puppeteer's browser cache to a project-local, path-relative directory.
 *
 * Why: the Chrome binary is downloaded during the build (`npm install`), but the
 * runtime start command runs from a different working directory (apps/server),
 * and build-time env vars (e.g. a nixpacks PUPPETEER_CACHE_DIR) do NOT propagate
 * to the runtime container. Resolving the cache dir relative to THIS file means
 * the install phase and the runtime phase agree on one location (<repo>/.cache/
 * puppeteer = /app/.cache/puppeteer on Railway), so the downloaded Chrome is
 * actually found at launch instead of failing with "Could not find Chrome".
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
