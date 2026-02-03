import UnoCSS from '@unocss/webpack';
import CopyPlugin from 'copy-webpack-plugin';
import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import type { WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';
import unoConfig from '../../uno.config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const plugins: WebpackPluginInstance[] = [
  // Copy static resource directories to webpack output for packaged app
  new CopyPlugin({
    patterns: [
      // skills directory: contains SKILL.md files for SkillManager loading
      { from: path.resolve(__dirname, '../../skills'), to: 'skills', noErrorOnMissing: true },
      // rules directory: contains assistant rule files
      { from: path.resolve(__dirname, '../../rules'), to: 'rules', noErrorOnMissing: true },
      // assistant directory: contains assistant config and skill definitions
      { from: path.resolve(__dirname, '../../assistant'), to: 'assistant', noErrorOnMissing: true },
      // logos directory: contains app logo images, use CopyPlugin to ensure binary files are not incorrectly encoded
      // force: true to overwrite corrupted files output by webpack asset/resource
      { from: path.resolve(__dirname, '../../src/renderer/assets/logos'), to: 'static/images', noErrorOnMissing: true, force: true },
    ],
  }),
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
  new webpack.DefinePlugin({
    'process.env.env': JSON.stringify(process.env.env),
  }),
  new MiniCssExtractPlugin({
    filename: '[name].css',
    chunkFilename: '[id].css',
  }),
  {
    apply(compiler) {
      if (compiler.options.name?.startsWith('HtmlWebpackPlugin')) {
        return;
      }
      UnoCSS(unoConfig).apply(compiler);
    },
  },
  // Ignore tree-sitter ?binary wasm imports, let aioncli-core's loadWasmBinary fallback read from disk
  new webpack.IgnorePlugin({
    resourceRegExp: /\.wasm\?binary$/,
  }),
];
