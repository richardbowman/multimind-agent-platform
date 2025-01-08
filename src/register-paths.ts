const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Ensure paths are normalized for cross-platform compatibility
const baseUrl = path.resolve(__dirname, '../dist'); // Points to compiled output directory
const cleanup = tsConfigPaths.register({
    baseUrl,
    paths: { "src/*": ["*"] },
    addMatchAll: false // Don't add a '*' match pattern
});

// Handle cleanup on both normal exit and exceptions
process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});
