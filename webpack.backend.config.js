const path = require('path');
const nodeExternals = require('webpack-node-externals');
const fs = require('fs');
const { ConcatSource } = require('webpack-sources');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfWorkerPath = path.join(pdfjsDistPath, 'build', 'pdf.worker.mjs');
console.log(`PDF DIST PATH: ${pdfWorkerPath}`);

class IncludeAllModulesPlugin {
  constructor(options) {
    this.directories = options.directories;
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync('IncludeAllModulesPlugin', (compilation, callback) => {
      this.directories.forEach(dir => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          if (file.endsWith('.ts')) {
            const modulePath = path.join(dir, file);
            const relativePath = path.relative(compiler.context, modulePath);
            compilation.fileDependencies.add(modulePath);
          }
        });
        // console.log(Array.from(compilation.fileDependencies));
      });
      callback();
    });
  }
}

module.exports = {
  target: 'electron-main',
  entry: './src/main.electron.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.electron.js'
  },
  devtool: 'eval-source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.electron.json',
              transpileOnly: true
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /LICENSE$/,
        type: 'asset/source'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'src': path.resolve(__dirname, 'src')
    },
    modules: [
      path.resolve(__dirname, 'src'),
      'node_modules'
    ],
    fullySpecified: false
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.electron.js'
  },
  externals: [nodeExternals({
    allowlist: [
      /^@agents\//,
      /^@executors\//,
      /^@tools\//,
      /^src\//
    ]
  })],
  externalsPresets: {
    node: true // Treat built-in node modules as external
  },
  plugins: [
    new IncludeAllModulesPlugin({
      directories: [
        path.resolve(__dirname, 'src/agents'),
        path.resolve(__dirname, 'src/agents/executors'),
        path.resolve(__dirname, 'src/agents/planners')
      ]
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'src/config/agents.json5'),
          to: path.resolve(__dirname, 'dist/agents.json5')
        },
        {
          from: path.resolve(__dirname, 'src/assets/goal-templates'),
          to: path.resolve(__dirname, 'dist/assets/goal-templates')
        },
        {
          from: path.resolve(__dirname, 'src/assets/procedure-guides'),
          to: path.resolve(__dirname, 'dist/assets/procedure-guides')
        },
        {
          from: pdfWorkerPath,
          to: './pdf.worker.mjs'
        },
        {
          from: 'src/workers/modelDownloader.worker.js',
          to: '.'
        },
        {
          from: path.posix.join(
          path.resolve(__dirname, "node_modules/onnxruntime-web/dist").replace(/\\/g, "/"),
          "*.wasm",
        ),
          to: '.'
        }
      ]
    })
  ]
};
