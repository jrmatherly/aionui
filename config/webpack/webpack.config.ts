import path from 'path';
import type { Configuration } from 'webpack';
import { plugins } from './webpack.plugins';
import { rules } from './webpack.rules';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'source-map' : false,
  // entry: "./src/index.ts",
  entry: {
    index: './src/index.ts',
    worker: './src/worker/index.ts',
    gemini: './src/worker/gemini.ts',
    acp: './src/worker/acp.ts',
    codex: './src/worker/codex.ts',
  },
  output: {
    filename: '[name].js',
    // path: path.resolve(__dirname, "../../main"),
  },
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@common': path.resolve(__dirname, '../../src/common'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@process': path.resolve(__dirname, '../../src/process'),
      '@worker': path.resolve(__dirname, '../../src/worker'),
      '@xterm/headless$': path.resolve(__dirname, '../../src/shims/xterm-headless.ts'),
    },
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    'node-pty': 'commonjs node-pty',
    // tree-sitter dependencies need to be external to avoid webpack processing .wasm files
    'tree-sitter': 'commonjs tree-sitter',
    'tree-sitter-bash': 'commonjs tree-sitter-bash',
    // web-tree-sitter is a nested dependency of aioncli-core
    'web-tree-sitter': 'commonjs web-tree-sitter',
    // Handle ?binary WASM imports from aioncli-core - let them fail so fallback can work
    'web-tree-sitter/tree-sitter.wasm?binary': 'commonjs web-tree-sitter/tree-sitter.wasm',
    'tree-sitter-bash/tree-sitter-bash.wasm?binary': 'commonjs tree-sitter-bash/tree-sitter-bash.wasm',
    // Pino logging: MUST be external. Pino's package.json has a "browser" field that
    // points to a console.log wrapper with NO transport/file/worker support. Webpack
    // resolves the browser build by default, silently breaking file logging, pino-roll,
    // pino-pretty, and pino-syslog. Externalizing ensures Node.js require() loads the
    // real pino with full transport support via thread-stream worker threads.
    'pino': 'commonjs pino',
    'pino-pretty': 'commonjs pino-pretty',
    'pino-roll': 'commonjs pino-roll',
    'pino-syslog': 'commonjs pino-syslog',
    'pino-abstract-transport': 'commonjs pino-abstract-transport',
    'pino-std-serializers': 'commonjs pino-std-serializers',
    'thread-stream': 'commonjs thread-stream',
    'real-require': 'commonjs real-require',
    'sonic-boom': 'commonjs sonic-boom',
    'on-exit-leak-free': 'commonjs on-exit-leak-free',
    '@pinojs/redact': 'commonjs @pinojs/redact',
    'safe-stable-stringify': 'commonjs safe-stable-stringify',
    'atomic-sleep': 'commonjs atomic-sleep',
    'process-warning': 'commonjs process-warning',
    'quick-format-unescaped': 'commonjs quick-format-unescaped',
  },
};
