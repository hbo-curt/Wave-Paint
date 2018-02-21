'use strict';

// Helper: root(), and rootDir() are defined at the bottom
var path = require('path');
var webpack = require('webpack');
var webpackMerge = require('webpack-merge');

// Webpack Plugins
var HtmlWebpackPlugin = require('html-webpack-plugin');
var autoprefixer = require('autoprefixer');
var ExtractTextPlugin = require("extract-text-webpack-plugin");
var CopyWebpackPlugin = require('copy-webpack-plugin');

var hotMiddleWarePort = 3001;

var DEFAULT_TARGET = 'app';
var target = process.env.TARGET || DEFAULT_TARGET;

// --optimize-dedupe not needed https://webpack.js.org/guides/migrating/#dedupeplugin-has-been-removed
// --optimize-occurence-order is on by default
// https://webpack.js.org/guides/migrating/#occurrenceorderplugin-is-now-on-by-default

/**
 * Env
 * Get npm lifecycle event to identify the environment
 */
var ENV = process.env.npm_lifecycle_event;

// Helper functions
const root = function(args) {
    args = Array.prototype.slice.call(arguments, 0);
    return path.join.apply(path, [__dirname].concat(args));
};

const prepend = function(extensions, args) {
    args = args || [];
    if (!Array.isArray(args)) {
        args = [args];
    }
    return extensions.reduce(function(memo, val) {
        return memo.concat(val, args.map(function(prefix) {
            return prefix + val;
        }));
    }, []); // webpack2 doesn't like the first entry being empty
};

const baseConfig = () => {
    const config = {};

    var isTestEnv = ENV === 'test' || ENV === 'test-watch';

    /**
     * Devtool
     * Reference: http://webpack.github.io/docs/configuration.html#devtool
     * Type of sourcemap to use per build type
     */
    if (isTestEnv) {
        config.devtool = 'inline-eval-source-map';
    } else if (ENV === 'prebuild') {
        config.devtool = false;
    } else {
        config.devtool = 'inline-eval-source-map';
    }

    config.target = 'web';

    /**
     * Entry
     * Reference: http://webpack.github.io/docs/configuration.html#entry
     */
    config.entry = isTestEnv || ENV === 'prebuild' ? {
        app: ['./src/index.js'],
        vendor: ['./src/vendor.js']
    } : [
        'webpack-dev-server/client?http://localhost:' + hotMiddleWarePort,
        './src/vendor.js',
        './src/index.js'
    ];

    config.output = {
        path: root('dist'),
        publicPath: '/',
        filename: ENV === 'prebuild' ? 'js/[name].[hash].js' : 'js/[name].js',
        chunkFilename: ENV === 'prebuild' ? '[id].[hash].chunk.js' : '[id].chunk.js'
    };


    config.resolve = {
        unsafeCache: !isTestEnv,
        modules: [
            root(),
            'node_modules'
        ],
        // only discover files that have those extensions
        // ensure .async.js etc also works
        extensions: prepend(['.jsx', '.js', '.json', '.css', '.scss', '.html'], '.async'),
        alias: {
            app: 'src/app',
            common: 'src/common',
            'common-styles': path.resolve(__dirname, 'node_modules/tools-common-styles/lib')
        }
    };

    config.module = {
        exprContextCritical: false,
        rules: [
            {
                test: /\.less$/,
                use: [{loader: 'style-loader'},
                    {loader: 'css-loader'},
                    {loader: 'postcss-loader'},
                    {loader: 'less-loader'}]
            },
            {
                // I combined the two, because why not?
                test: /\.(css|scss)$/,
                use: [{loader: 'style-loader', query: {sourceMap: ENV !== 'prebuild'}},
                    {loader: 'css-loader', query: {sourceMap: ENV !== 'prebuild'}},
                    {loader: 'postcss-loader', query: {sourceMap: ENV !== 'prebuild'}},
                    {
                        loader: 'sass-loader',
                        options: {
                            sourceMap: ENV !== 'prebuild'
                        },
                    }]
            },
            isTestEnv ? {} : {
                enforce: 'pre',
                test: /\.jsx?$/,
                loader: 'eslint-loader',
                exclude: /(node_modules)/,
            },
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: [{
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                'es2015',
                                'stage-2'
                            ]
                        }
                    }],

                include: path.join(__dirname, 'src')
            },
            {
                test: /\.(woff|woff2|ttf|eot|svg)(\?v=[a-z0-9]\.[a-z0-9]\.[a-z0-9])?$/,
                loader: 'url-loader?limit=100000'
            },
            {
                test: /\.(png|jpg|jpeg|gif)$/,
                loader: 'url-loader?limit=8192'
            }
        ],
        // noParse: ['filetoignore.js']
    };

    config.plugins = [
        new webpack.DefinePlugin({
            // Environment helpers
            'process.env': {
                ENV: JSON.stringify(ENV),
                NODE_ENV: JSON.stringify(ENV === 'prebuild' ? 'production' : 'development'),
                PERMISSIONS_SERVER_HOST: JSON.stringify(
                    process.env.PERMISSIONS_SERVER_HOST ||
                    'https://beta-permissions-server.tools.hbo.com'
                )
            }
        }),
        new webpack.DefinePlugin({
            "process.env": {
                NODE_ENV: JSON.stringify("production")
            }
        }),
        new webpack.SourceMapDevToolPlugin({
            filename: '[file].js.map'
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            inject: 'body',
            title: 'App - ' + target
        }),
        new webpack.LoaderOptionsPlugin({
            debug: ENV !== 'prebuild' || !isTestEnv,
            options: {
                context: '/',
                postcss: [
                    autoprefixer({
                        browsers: ['last 2 versions']
                    })
                ]
            }
        })
    ];

    if (!isTestEnv) {
        config.plugins.push(
            // Generate common chunks if necessary
            // Reference: https://webpack.github.io/docs/code-splitting.html
            // Reference: https://webpack.github.io/docs/list-of-plugins.html#commonschunkplugin
            new webpack.optimize.CommonsChunkPlugin({
                name: 'vendor',
                filename: ENV === 'prebuild' ? 'js/[name].[hash].js' : 'js/[name].js',
                minChunks: Infinity
            }),
            new webpack.optimize.CommonsChunkPlugin({
                name: 'common',
                filename: ENV === 'prebuild' ? 'js/[name].[hash].js' : 'js/[name].js',
                minChunks: 2,
                chunks: ['app', 'vendor']
            }),

            // Inject script and link tags into html files
            // Reference: https://github.com/ampedandwired/html-webpack-plugin

            new HtmlWebpackPlugin({
                template: './public/index.html',
                inject: 'body',
                title: 'App - ' + target,
                chunksSortMode: function compare(a, b) {
                    // common always first
                    if (a.names[0] === 'common') {
                        return -1;
                    }
                    // app always last
                    if (a.names[0] === 'app') {
                        return 1;
                    }
                    // vendor before app
                    if (a.names[0] === 'vendor' && b.names[0] === 'app') {
                        return -1;
                    } else {
                        return 1;
                    }
                    // a must be equal to b
                    /* eslint-disable no-unreachable */
                    return 0;
                    /* eslint-disable no-unreachable */
                }
            }),

            new webpack.DefinePlugin({
                __WEBPACK__: true, // say we're the webpack
                __DEV__: process.env.BUILD_DEV // dev environment indication
            }),

            // Extract css files
            // Reference: https://github.com/webpack/extract-text-webpack-plugin
            // Disabled when in test mode or not in build mode
            new ExtractTextPlugin({filename: 'css/[name].[hash].css', disable: ENV !== 'prebuild'})
        );
    }

    // Add build specific plugins
    if (ENV === 'prebuild') {
        config.plugins.push(
            // Reference: http://webpack.github.io/docs/list-of-plugins.html#noerrorsplugin
            // Only emit files when there are no errors
            new webpack.NoEmitOnErrorsPlugin(),

            // Reference: http://webpack.github.io/docs/list-of-plugins.html#dedupeplugin
            // Dedupe modules in the output
            // new webpack.optimize.DedupePlugin(), // removed from webpack

            // Reference: http://webpack.github.io/docs/list-of-plugins.html#uglifyjsplugin
            // Minify all javascript, switch loaders to minimizing mode
            new webpack.optimize.UglifyJsPlugin({
                // to debug prod builds uncomment //debug lines and comment //prod lines

                // beautify: true,//debug
                // mangle: false,//debug
                // dead_code: false,//debug
                // unused: false,//debug
                // deadCode: false,//debug
                // compress : {
                //      screw_ie8 : true, keep_fnames: true, drop_debugger: false, dead_code: false, unused: false,
                // }, // debug
                // comments: true,//debug

                beautify: false, // prod
                mangle: {
                    screw_ie8: true,
                    except: ['RouterLink'] // needed for uglify RouterLink problem
                }, // prod
                compress: {screw_ie8: true}, // prod
                comments: false, // prod,
                sourceMap: true
            }),

            // Copy assets from the public folder
            // Reference: https://github.com/kevlened/copy-webpack-plugin
            new CopyWebpackPlugin([{
                from: root('public')
            }])
        );
    }

    config.stats = {
        warnings: false
    };

    config.devServer = {
        port: hotMiddleWarePort,
        contentBase: './public',
        historyApiFallback: true,
        stats: 'minimal', // none (or false), errors-only, minimal, normal (or true) and verbose
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
        },
        proxy: [
            {
                path: '/assets/common-styles.css',
                target: `http://localhost:3001`,
                secure: false,
                //changeOrigin: true
            },
            {
                path: '/api/login',
                pathRewrite: {'^/api/login': '/api/login/v2'},
                target: `http://localhost:3002`,
                secure: false,
                //changeOrigin: true
            }
        ]
    };

    return config;
};

const targets = ['web' /*, 'webworker', 'node', 'async-node', 'node-webkit', 'electron-main'*/].map((target) => {

    const base = webpackMerge(baseConfig(), {
        target: target,
        output: {
            path: path.resolve(__dirname, 'dist/' + target),
            filename: '[name].' + target + '.js'
        }
    });

    return base;
});

module.exports = targets;
// module.exports = baseConfig();