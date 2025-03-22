const path = require('path');
const webpack = require('webpack');
const { createTheme } = require('@mui/material/styles');

module.exports = {
  entry: './src/website-libs.js',
  output: {
    path: path.resolve(__dirname, 'dist/website-libs'),
    filename: 'website-libs.min.js',
    library: {
      type: 'umd',
      name: 'WebsiteLibs'
    },
    globalObject: 'this',
    libraryTarget: 'umd'
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }
      }
    ]
  }
};
