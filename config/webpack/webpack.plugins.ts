import UnoCSS from '@unocss/webpack';
import CopyPlugin from 'copy-webpack-plugin';
import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import type { Compiler, WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';
import unoConfig from '../../uno.config';

// Read brand name from environment at build time
const BRAND_NAME = process.env.AIONUI_BRAND_NAME || 'AionUi';

/**
 * Plugin to inject branding into HtmlWebpackPlugin templates.
 * Works with Electron Forge's webpack plugin by hooking into HtmlWebpackPlugin's
 * compilation hooks to add template parameters.
 */
class BrandingInjectorPlugin implements WebpackPluginInstance {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('BrandingInjectorPlugin', (compilation) => {
      // Hook into HtmlWebpackPlugin's template parameter generation
      const hooks = HtmlWebpackPlugin.getCompilationHooks(compilation);
      hooks.beforeEmit.tapAsync('BrandingInjectorPlugin', (data, cb) => {
        // Replace placeholder in HTML
        data.html = data.html.replace(/<title>[^<]*<\/title>/, `<title>${BRAND_NAME}</title>`);
        cb(null, data);
      });
    });
  }
}

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
    'process.env.AIONUI_BRAND_NAME': JSON.stringify(BRAND_NAME),
  }),
  // Inject brand name into HTML template at build time
  new BrandingInjectorPlugin(),
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
