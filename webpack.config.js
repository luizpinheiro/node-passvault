const { BannerPlugin } = require('webpack')
const path = require('path')

module.exports = {
  entry: path.resolve(__dirname, './src/app.ts'),
  mode: 'production',
  target: 'node',
  optimization: {
    minimize: true,
  },
  output: {
    path: path.resolve(__dirname, './build'),
    filename: 'node-passvault.js', // must bring the extension or minification won't work
    clean: true,
  },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
    }),
  ],
}
