const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  entry: './src/main.electron.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.electron.js'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  externals: [nodeExternals()], // Exclude node_modules
  externalsPresets: {
    node: true // Treat built-in node modules as external
  }
};
