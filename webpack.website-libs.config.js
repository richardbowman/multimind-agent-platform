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
    }),
    new webpack.DefinePlugin({
      'process.env.THEMES': JSON.stringify({
        light: createTheme(),
        dark: createTheme({
          palette: {
            mode: 'dark',
          },
        }),
        blue: createTheme({
          palette: {
            primary: {
              main: '#1976d2',
            },
            secondary: {
              main: '#9c27b0',
            },
          },
        }),
        green: createTheme({
          palette: {
            primary: {
              main: '#2e7d32',
            },
            secondary: {
              main: '#ff9800',
            },
          },
        }),
        corporate: createTheme({
          palette: {
            primary: {
              main: '#3f51b5',
            },
            secondary: {
              main: '#f50057',
            },
          },
          typography: {
            fontFamily: 'Roboto, Arial, sans-serif',
          },
        }),
      })
    })
  ]
};
