const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs');

async function downloadModels() {
    const modelDir = path.join(__dirname, '..', 'dist', 'whisper-models');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
    }

    console.log('Downloading Whisper models...');
    
    // Download the tiny.en model
    await nodewhisper.downloadModel('tiny.en', {
        modelDir,
        logger: console
    });

    console.log('Whisper models downloaded successfully');
}

downloadModels().catch(err => {
    console.error('Failed to download Whisper models:', err);
    process.exit(1);
});
