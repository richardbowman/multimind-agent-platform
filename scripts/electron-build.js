const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

console.log('🚀 Starting Electron build process...');

try {
    // Clean dist directory
    console.log('Cleaning dist directory...');
    fs.removeSync('dist');

    // Build the client app
    console.log('Building client app...');
    execSync('npm run build:web', { stdio: 'inherit' });

    // Run TypeScript compilation with electron config
    console.log('Compiling TypeScript...');
    execSync('tsc -p tsconfig.electron.json --noCheck', { stdio: 'inherit' });

    // Copy client files and config
    console.log('Copying client files and config...');
    require('./copy-client-files.js');
    
    // Copy env file
    console.log('Copying env...');
    fs.copyFileSync('defaults.json', path.join('dist', 'defaults.json'));

    // Run electron-builder
    console.log('Building Electron app...');
    execSync('electron-builder', { stdio: 'inherit' });

    console.log('✅ Build completed successfully!');
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}
