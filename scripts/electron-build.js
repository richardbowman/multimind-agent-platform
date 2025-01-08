const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting Electron build process...');

try {
    // Clean dist directory
    console.log('Cleaning dist directory...');
    execSync('rm -rf dist', { stdio: 'inherit' });

    // Build the client app
    console.log('Building client app...');
    execSync('cd src/web/client && npm run build', { stdio: 'inherit' });

    // Run TypeScript compilation with electron config
    console.log('Compiling TypeScript...');
    execSync('tsc -p tsconfig.electron.json --noCheck', { stdio: 'inherit' });

    // Copy client files and config
    console.log('Copying client files and config...');
    require('./copy-client-files.js');
    
    // Copy env.defaults
    console.log('Copying env...');
    execSync('cp .env dist/', { stdio: 'inherit' });

    // Run electron-builder
    console.log('Building Electron app...');
    execSync('electron-builder', { stdio: 'inherit' });

    console.log('✅ Build completed successfully!');
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}
