const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    react: 'react',
    reactDOM: 'react-dom',
    mui: '@mui/material'
  },
  output: {
    path: path.resolve(__dirname, 'dist/website-libs'),
    filename: '[name].min.js',
    library: '[name]',
    libraryTarget: 'umd'
  },
  mode: 'production',
  optimization: {
    minimize: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      React: 'react'
    })
  ]
};
