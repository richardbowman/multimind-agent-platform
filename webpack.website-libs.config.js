const path = require('path');
const webpack = require('webpack');

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
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
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
