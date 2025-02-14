const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const webpackNodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/web/client/src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/web'),
    filename: 'bundle.js',
    publicPath: './'
  },
  // target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.client.json',
            transpileOnly: true
          }
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.md$/,
        type: 'asset/source'
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@web': path.resolve(__dirname, 'src/web'),
      'src': path.resolve(__dirname, 'src')
    },
    modules: [
      path.resolve(__dirname, 'src'),
      'node_modules'
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/web/client/public/index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '**/*',
          context: './src/web/client/public',
          globOptions: {
            ignore: ["**/index.html"]
          }
        },
        {
          from: path.resolve(__dirname, 'node_modules/react/umd/react.production.min.js'),
          to: path.resolve(__dirname, 'dist/web/react/react.min.js')
        },
        {
          from: path.resolve(__dirname, 'node_modules/react-dom/umd/react-dom.production.min.js'),
          to: path.resolve(__dirname, 'dist/web/react-dom/react-dom.min.js')
        },
        {
          from: path.resolve(__dirname, 'node_modules/@mui/material/umd/material-ui.production.min.js'),
          to: path.resolve(__dirname, 'dist/web/mui/material-ui.min.js')
        }
      ]
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify('0.0.0')
    })
  ],
  devtool: 'source-map',
  devServer: {
    historyApiFallback: true,
    port: 3000,
    hot: true
  }
};
