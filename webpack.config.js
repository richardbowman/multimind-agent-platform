const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/web/client/src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/web'),
    filename: 'bundle.js',
    publicPath: './'
  },
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
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@web': path.resolve(__dirname, 'src/web')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/web/client/public/index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: './src/web/client/public/splash.html',
          to: 'splash.html'
        }
      ]
    })
  ],
  devServer: {
    historyApiFallback: true,
    port: 3000,
    hot: true
  }
};
