/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

const { execSync } = require('child_process');

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function runPostInstall() {
  try {

    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies.
      // Note: electron-builder internally sets npm_config_build_from_source in its
      // getGypEnv() when buildFromSource is configured — no need to pass it here.
      // Passing it explicitly caused "Unknown env config" warnings in npm 11.9+.
      console.log('Local environment, installing app deps');
      execSync('npx electron-builder install-app-deps', {
        stdio: 'inherit',
      });
    }
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;