/**
 * This file can be edited to customize webpack configuration.
 * To reset delete this file and rerun theia build again.
 */
// @ts-check
const webpack = require('webpack');
const configs = require('./gen-webpack.config.js');
const nodeConfig = require('./gen-webpack.node.config.js');

/**
 * Expose bundled modules on window.theia.moduleName namespace, e.g.
 * window['theia']['@theia/core/lib/common/uri'].
 * Such syntax can be used by external code, for instance, for testing.
configs[0].module.rules.push({
    test: /\.js$/,
    loader: require.resolve('@theia/application-manager/lib/expose-loader')
}); */

// @vscode/windows-ca-certs may not be built — mark as optional external
nodeConfig.config.externals = {
    ...nodeConfig.config.externals,
    '@vscode/windows-ca-certs': 'commonjs @vscode/windows-ca-certs',
};

// Tools like VS Code and Claude Code set ELECTRON_RUN_AS_NODE=1 which forces
// Electron into plain Node.js mode, breaking require('electron') and preventing
// the app from starting. Inject the fix at the top of the bundled electron-main.js.
nodeConfig.config.plugins = [
    ...(nodeConfig.config.plugins || []),
    new webpack.BannerPlugin({
        banner: 'delete process.env.ELECTRON_RUN_AS_NODE;',
        raw: true,
        entryOnly: true,
        test: /electron-main\.js$/,
    }),
    // Tell Theia where to find bundled plugins (vscode.git, TypeScript, etc.).
    // Without this, the plugin deployer has no plugins to load — no SCM, no
    // language features, nothing. In packaged Electron: process.resourcesPath
    // points to the resources/ folder. In dev: fall back to ../../plugins.
    new webpack.BannerPlugin({
        banner: [
            'if (!process.env.THEIA_DEFAULT_PLUGINS) {',
            '  var __p = require("path");',
            '  process.env.THEIA_DEFAULT_PLUGINS = "local-dir:" + __p.resolve(',
            '    process.resourcesPath || __p.resolve(__dirname, "..", ".."), "plugins"',
            '  );',
            '}',
        ].join('\n'),
        raw: true,
        entryOnly: true,
        test: /main\.js$/,
    }),
    // Force webpack to bundle drivelist instead of externalizing it.
    // The NativeWebpackPlugin handles the .node binding via node-loader, but
    // require('drivelist') gets externalized in production builds. This plugin
    // redirects the import to the resolved path so webpack bundles the JS wrapper.
    new webpack.NormalModuleReplacementPlugin(
        /^drivelist$/,
        require.resolve('drivelist'),
    ),
];

module.exports = [
    ...configs,
    nodeConfig.config
];
