const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');

const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  mode: 'development',
  entry: './src/index.tsx',
  stats: {
    warnings: false,
  },
  cache: {
    type: 'filesystem',
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.png', '.jpg', '.svg', '.css', '.less', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  devtool: 'eval-source-map',
  devServer: {
    // contentBase: path.join(__dirname, 'dist'),
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    hot: true,
    port: 5173,
    historyApiFallback: true,  // Enable support for single-page applications
    open: true,                // Automatically opens the browser
    liveReload: true,  // Ensure the browser reloads on file changes
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        // use: [
        //   {
        //     loader: 'ts-loader',
        //     options: {
        //       transpileOnly: true,
        //     },
        //   },
        // ],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.less$/,
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
      {
        test: /\.svg$/,
        // use: [
        //   {
        //     loader: '@svgr/webpack',
        //     options: {
        //       // Add any SVGR options here if needed
        //     },
        //   }, // 
        //   'file-loader',
        // ],
        use: [
          '@svgr/webpack',
          'url-loader', // Or 'file-loader', depending on your setup
        ],
      },
      {
        // test: /\.(png|jpe?g|svg)$/,
        test: /\.(png|jpe?g|gif)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].[ext]',
              // outputPath: 'assets',
            },
          },
        ],
      },
      // {
      //   enforce: 'pre',
      //   test: /\.js$/,
      //   loader: 'source-map-loader',
      // },
    ],
  },
  plugins: [
    new BundleAnalyzerPlugin(),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    // new webpack.DefinePlugin({
    //   'process.env': JSON.stringify(process.env),
    // }),
  ],
};
