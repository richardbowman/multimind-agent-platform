const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  entry: './src/agents/executors/nodeWorker.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'nodeWorker.js'
  },
  devtool: 'eval-cheap-module-source-map',
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
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'src': path.resolve(__dirname, 'src')
    }
  },
  externals: [nodeExternals({
    allowlist: [
      'csv-parse/sync',
      'csv-stringify/sync',
      'stream-transform',
      'csv-generate'
    ]
  })],
  externalsPresets: {
    node: true
  }
};
