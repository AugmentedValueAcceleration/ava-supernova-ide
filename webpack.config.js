/**
 * This file can be edited to customize webpack configuration.
 * To reset delete this file and rerun theia build again.
 */
// @ts-check
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

// On Windows the native addon for @vscode/windows-ca-certs may fail to
// compile (node-gyp). Mark it as external so webpack doesn't try to bundle
// it — Node.js will require() it at runtime and Theia handles the missing
// native gracefully.
if (process.platform === 'win32') {
    nodeConfig.config.externals = nodeConfig.config.externals || {};
    if (typeof nodeConfig.config.externals === 'object' && !Array.isArray(nodeConfig.config.externals)) {
        nodeConfig.config.externals['@vscode/windows-ca-certs'] = 'commonjs @vscode/windows-ca-certs';
    } else {
        // If externals is already an array or function, wrap it
        const prev = nodeConfig.config.externals;
        nodeConfig.config.externals = [
            { '@vscode/windows-ca-certs': 'commonjs @vscode/windows-ca-certs' },
            ...(Array.isArray(prev) ? prev : [prev]),
        ];
    }
}

module.exports = [
    ...configs,
    nodeConfig.config
];
