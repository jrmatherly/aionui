import path from 'path';
import type { Configuration } from 'webpack';
import webpack from 'webpack';
import { plugins } from './webpack.plugins';
import { rules } from './webpack.rules';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const rendererConfig: Configuration = {
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'source-map' : false,
  // NOTE: Do NOT enable webpack filesystem cache for the renderer.
  // UnoCSS generates utility classes by scanning source files at build time.
  // Webpack's filesystem cache skips re-running this scan on cached modules,
  // producing incomplete CSS with missing utility classes (broken styling).
  // See: https://github.com/unocss/unocss/issues/419
  // The main process config CAN use filesystem cache (no UnoCSS there).
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    // Provide Buffer and process global variables for renderer process Node.js polyfills
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@common': path.resolve(__dirname, '../../src/common'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@process': path.resolve(__dirname, '../../src/process'),
      '@worker': path.resolve(__dirname, '../../src/worker'),
      // Resolve process/browser import issues in ESM modules
      'process/browser': require.resolve('process/browser.js'),
      // Force use of Streamdown's ESM version
      'streamdown': path.resolve(__dirname, '../../node_modules/streamdown/dist/index.js'),
    },
    fallback: {
      'crypto': false,
      'node:crypto': false,
      'stream': require.resolve('stream-browserify'),
      'buffer': require.resolve('buffer'),
      'process': require.resolve('process/browser.js'),
      'process/browser': require.resolve('process/browser.js'),
      'zlib': false,
      'util': false,
    },
  },
  externals: {
    'node:crypto': 'commonjs2 crypto',
    'crypto': 'commonjs2 crypto',
  },
  optimization: {
    realContentHash: true,
    minimize: !isDevelopment,
    splitChunks: isDevelopment ? false : {
      chunks: 'all',
      maxInitialRequests: 25,
      minSize: 20000,
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
          name: 'react',
          priority: 30,
        },
        arco: {
          test: /[\\/]node_modules[\\/]@arco-design[\\/]/,
          name: 'arco',
          priority: 25,
        },
        markdown: {
          test: /[\\/]node_modules[\\/](react-markdown|react-syntax-highlighter|katex|rehype-katex|remark-)[\\/]/,
          name: 'markdown',
          priority: 20,
        },
        codemirror: {
          test: /[\\/]node_modules[\\/](@uiw|@codemirror)[\\/]/,
          name: 'codemirror',
          priority: 20,
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
      },
    },
  },
};
