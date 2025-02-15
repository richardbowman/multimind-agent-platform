const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    'react': 'react',
    'react-dom': 'react-dom',
    '@mui/material': '@mui/material'
  },
  output: {
    path: path.resolve(__dirname, 'dist/website-libs'),
    filename: '[name].min.js',
    library: {
      root: '[name]',
      amd: '[name]',
      commonjs: '[name]'
    },
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
