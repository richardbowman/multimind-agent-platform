const tsConfigPaths = require('tsconfig-paths');

const baseUrl = "./dist"; // This should point to your compiled output directory
const cleanup = tsConfigPaths.register({
    baseUrl,
    paths: { "src/*": ["*"] }
});

process.on('exit', cleanup);
