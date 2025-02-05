import React, { useState, useEffect, useRef } from 'react';
import Mic from '@mui/icons-material/Mic';
import Stop from '@mui/icons-material/Stop';
import { useIPCService } from '../contexts/IPCContext';
import { useDataContext } from '../contexts/DataContext';

export const MicrophoneButton: React.FC = () => {
    const { currentChannelId, currentThreadId } = useDataContext();
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const ipcService = useIPCService();
    const currentThreadIdRef = useRef(currentThreadId);
    
    // Keep the ref updated with the latest thread ID
    useEffect(() => {
        currentThreadIdRef.current = currentThreadId;
    }, [currentThreadId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                if (!isRecording) {
                    handleRecording();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                if (isRecording) {
                    handleRecording();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isRecording]);
    
    const handleRecording = async () => {
        if (isRecording) {
            // Stop recording
            mediaRecorder?.stop();
            setIsRecording(false);
            return;
        }

        try {
            // Start recording
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            setMediaRecorder(recorder);
            
            // Use local array to collect chunks
            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => {
                chunks.push(e.data);
            };

            // Store the stream so we can clean it up later
            const currentStream = stream;
            const threadId = currentThreadIdRef.current;
            
            recorder.onstop = async () => {
                try {
                    // Combine audio chunks
                    const audioBlob = new Blob(chunks, { type: 'audio/webm' });

                    // Convert WebM to WAV using AudioContext and resample to 16kHz
                    const audioContext = new AudioContext();
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Create a new AudioContext at 16kHz
                    const targetSampleRate = 16000;
                    const offlineContext = new OfflineAudioContext(
                        audioBuffer.numberOfChannels,
                        audioBuffer.length * (targetSampleRate / audioBuffer.sampleRate),
                        targetSampleRate
                    );
                    
                    // Create a buffer source and connect it
                    const source = offlineContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(offlineContext.destination);
                    source.start();
                    
                    // Render the audio at 16kHz
                    const wavBlob = await new Promise<Blob>(resolve => {
                        offlineContext.startRendering().then(renderedBuffer => {
                            const wavBytes = audioBufferToWav(renderedBuffer);
                            resolve(new Blob([wavBytes], { type: 'audio/wav' }));
                        });
                    });

                    // Convert WAV to base64
                    const wavBase64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (typeof reader.result === 'string') {
                                // Remove data URL prefix
                                const base64 = reader.result.split(',')[1];
                                resolve(base64);
                            } else {
                                reject(new Error('Failed to read WAV as base64'));
                            }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(wavBlob);
                    });

                    if (currentChannelId && currentThreadId) {
                        try {
                            await ipcService.getRPC().transcribeAndSendAudio({
                                audioBase64: wavBase64,
                                channelId: currentChannelId,
                                threadId: threadId,
                                language: 'en'
                            });
                        } catch (error) {
                            console.error('Transcription failed:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error processing audio:', error);
                } finally {
                    // Clean up
                    currentStream.getTracks().forEach(track => track.stop());
                    setMediaRecorder(null);
                    setIsRecording(false);
                }
            };

            recorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
        }
    };

    return (
        <button
            style={{
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: isRecording ? '#ff4444' : '#444',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                transition: 'all 0.2s ease'
            }}
            onClick={handleRecording}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isRecording ? '#ff6666' : '#555';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isRecording ? '#ff4444' : '#444';
            }}
        >
            {isRecording ? <Stop /> : <Mic />}
        </button>
    );
};

// Helper function to convert AudioBuffer to WAV
function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const bitsPerSample = 16;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;

    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    writeString(view, 0, 'RIFF'); // RIFF header
    view.setUint32(4, 36 + dataSize, true); // File size
    writeString(view, 8, 'WAVE'); // WAVE header
    writeString(view, 12, 'fmt '); // fmt chunk
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true); // Number of channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, byteRate, true); // Byte rate
    view.setUint16(32, blockAlign, true); // Block align
    view.setUint16(34, bitsPerSample, true); // Bits per sample
    writeString(view, 36, 'data'); // data chunk
    view.setUint32(40, dataSize, true); // data chunk size

    // Write audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Uint8Array(arrayBuffer);
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
