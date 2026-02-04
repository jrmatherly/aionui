import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import type { ModuleOptions } from 'webpack';
export const rules: Required<ModuleOptions>['rules'] = [
  // Ignore tree-sitter .wasm file imports, these are handled via externals in Electron
  {
    test: /\.wasm$/,
    type: 'asset/resource',
    generator: {
      filename: 'wasm/[name][ext]',
    },
  },
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /\.m?js/,
    resolve: {
      fullySpecified: false,
    },
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    // Exclude pure JS libraries to prevent relocator loader from incorrectly parsing dependency paths (especially hoisted dependencies)
    exclude: /[/\\]node_modules[/\\](mermaid|streamdown|marked|shiki|@shikijs)[/\\]/,
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        transpileOnly: true,
      },
    },
  },
  {
    test: /\.css$/,
    use: [
      MiniCssExtractPlugin.loader,
      {
        loader: 'css-loader',
        options: {
          importLoaders: 1,
          modules: {
            auto: true, // Only enable CSS Modules for *.module.css files (default behavior)
            namedExport: false, // Preserve v6 behavior for CSS Modules (css-loader v7 defaults to true)
          },
        },
      },
      'postcss-loader',
    ],
    include: [/src/, /node_modules/], // Added node_modules inclusion
  },
  // UnoCSS virtual CSS file handling
  {
    test: /_virtual_%2F__uno\.css$/,
    use: [MiniCssExtractPlugin.loader, 'css-loader'],
  },
  // Font file loading rules
  {
    test: /\.(woff|woff2|eot|ttf|otf)$/i,
    type: 'asset/resource',
    generator: {
      filename: 'static/fonts/[name][ext]',
    },
  },
  {
    test: /\.(png|jpe?g|gif|bmp|webp)$/i,
    type: 'asset/resource',
    generator: {
      filename: 'static/images/[name][ext]',
    },
  },
  {
    test: /\.json$/,
    type: 'json', // Use Webpack 5 built-in JSON parsing
    parser: {
      parse: (source: string) => {
        // Custom parser
        try {
          return JSON.parse(source);
        } catch (e) {
          // console.error('JSON parsing failed:', e);
          return {};
        }
      },
    },
  },
  // SVG file handling rules
  {
    test: /\.svg$/,
    type: 'asset/resource',
    generator: {
      filename: 'static/images/[name][ext]',
    },
  },
  {
    test: /\.tsx$/,
    exclude: /node_modules/,
    use: [
      {
        loader: path.resolve(__dirname, './icon-park-loader.js'),
        options: {
          cacheDirectory: true,
          cacheIdentifier: 'icon-park-loader',
        },
      },
    ],
  },
];
