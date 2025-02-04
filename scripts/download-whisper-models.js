const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const fs = require('fs');

async function downloadModels() {
    const modelDir = path.join(__dirname, '..', 'dist', 'whisper-models');
    const sampleAudioPath = path.join(__dirname, '..', 'src', 'assets', 'sample.wav');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
    }

    console.log('Triggering Whisper model download via transcription...');
    
    try {
        // This will trigger the model download
        const transcription = await nodewhisper(sampleAudioPath, {
            modelName: 'tiny.en',
            modelDir,
            removeWavFileAfterTranscription: false,
            withCuda: false,
            logger: console,
            whisperOptions: {
                outputInText: true,
                outputInSrt: false
            }
        });

        console.log('Whisper models downloaded successfully');
        console.log('Test transcription:', transcription);
    } catch (err) {
        console.error('Failed to download Whisper models:', err);
        process.exit(1);
    }
}

downloadModels();
