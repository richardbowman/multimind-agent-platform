const tsConfigPaths = require('tsconfig-paths');
const tsConfig = require('./tsconfig.json');

const baseUrl = "./dist"; // This should point to your compiled output directory
const cleanup = tsConfigPaths.register({
    baseUrl,
    paths: { "src/*": ["*"] }
});

// If you need to cleanup the path registration
// process.on('exit', cleanup);
