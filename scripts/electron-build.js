const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting Electron build process...');

try {
    // Clean dist directory
    console.log('Cleaning dist directory...');
    execSync('rm -rf dist', { stdio: 'inherit' });

    // Run TypeScript compilation
    console.log('Compiling TypeScript...');
    execSync('tsc', { stdio: 'inherit' });

    // Copy client files
    console.log('Copying client files...');
    require('./copy-client-files.js');

    // Run electron-builder
    console.log('Building Electron app...');
    execSync('electron-builder', { stdio: 'inherit' });

    console.log('✅ Build completed successfully!');
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}
