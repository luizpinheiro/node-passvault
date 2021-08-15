const { BannerPlugin } = require('webpack')
const path = require('path')

module.exports = {
  entry: path.resolve(__dirname, './src/app.ts'),
  mode: 'production',
  target: 'node',
  output: {
    path: path.resolve(__dirname, "./build"),
    filename: 'node-passvault',
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
