const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

console.log('🚀 Starting Electron build process...');

try {
    // Build the client app
    console.log('Building...');
    execSync('yarn build:all', { stdio: 'inherit' });

    // Copy env file
    console.log('Copying env...');
    fs.copyFileSync('defaults.json5', path.join('dist', 'defaults.json5'));

    // Run electron-builder
    console.log('Building Electron app...');
    execSync('electron-builder', { stdio: 'inherit' });

    console.log('✅ Build completed successfully!');
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}
