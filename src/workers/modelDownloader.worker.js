// modelDownloader.worker.js
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs/promises');
const path = require('path');

async function createModelDownloader(options) {
    const nlc = await Function('return import("node-llama-cpp")')();
    return nlc.createModelDownloader(options);
}

async function loadLlama(options) {
    const nlc = await Function('return import("node-llama-cpp")')();
    return nlc.getLlama(options);
}


console.log('RECEIVED MESSAGE');
const { modelUri, dirPath, parallelDownloads, token } = workerData;

async function download() {
    try {
        parentPort.postMessage({
            type: 'progressMsg',
            message: 'Starting download ...'
        });

        const modelDownload = await createModelDownloader({
            modelUri,
            dirPath,
            parallelDownloads,
            showCliProgress: true,
            token,
            onProgress: ({ totalSize, downloadedSize }) => {
                parentPort.postMessage({
                    type: 'progress',
                    totalSize,
                    downloadedSize
                });
            }
        });

        const modelPath = await modelDownload.download();

        await fs.writeFile(path.join(dirPath, "model.json"), JSON.stringify({
            entrypointFilename: modelDownload.entrypointFilename,
            totalFiles: modelDownload.totalFiles,
            totalSize: modelDownload.totalSize,
            modelPath: modelPath
        }, null, 2));

        parentPort.postMessage({
            type: 'progressMsg',
            message: 'Download complete. Testing model load ...'
        });

        const llama = await loadLlama();
        const model = await llama.loadModel({
            modelPath
        });
        await model.dispose();
        await llama.dispose();

        parentPort.postMessage({
            type: 'progressMsg',
            message: 'Completed testing ...'
        });

        parentPort.postMessage({
            type: 'complete',
            entrypointFilePath: modelPath
        });
    } catch (error) {
        console.error(error);
        parentPort.postMessage({
            type: 'error',
            error: error
        });
    }
}

download();