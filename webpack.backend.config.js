const path = require('path');
const nodeExternals = require('webpack-node-externals');
const fs = require('fs');
const { ConcatSource } = require('webpack-sources');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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
  target: 'node',
  entry: './src/main.electron.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.electron.js'
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.electron.json',
            transpileOnly: true
          }
        },
        exclude: /node_modules/
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
    // Add this to handle context requires
    fullySpecified: false
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
          from: path.resolve(__dirname, 'defaults.json5'),
          to: path.resolve(__dirname, 'dist/defaults.json5')
        }
      ]
    })
  ]
};
