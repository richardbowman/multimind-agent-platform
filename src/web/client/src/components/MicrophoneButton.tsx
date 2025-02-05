import React, { useState, useEffect, useRef, useCallback } from 'react';
import Mic from '@mui/icons-material/Mic';
import Stop from '@mui/icons-material/Stop';
import { useIPCService } from '../contexts/IPCContext';
import { useDataContext } from '../contexts/DataContext';

export const MicrophoneButton: React.FC = () => {
    const { currentChannelId, currentThreadId } = useDataContext();
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false); // Ref for immediate access
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const silenceTimer = useRef<number | null>(null);
    const silenceDetectionInterval = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    // Silence detection parameters
    const SILENCE_THRESHOLD = -60; // Lower threshold for better sensitivity
    const SILENCE_DURATION = 3000; // Longer duration before stopping
    const ANALYZER_FFT_SIZE = 2048;
    const MIN_VALID_VOLUME = -100; // Allow for quieter signals
    const SOUND_THRESHOLD = -50; // Minimum dB to consider as active speech
    const ipcService = useIPCService();
    const currentThreadIdRef = useRef(currentThreadId);
    
    // Keep the ref updated with the latest thread ID
    useEffect(() => {
        currentThreadIdRef.current = currentThreadId;
    }, [currentThreadId]);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                if (!isRecordingRef.current) {
                    try {
                        // Ensure we have proper permissions
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        stream.getTracks().forEach(track => track.stop());
                        
                        // Start recording after permissions are confirmed
                        handleRecording();
                    } catch (error) {
                        console.error('Error getting audio permissions:', error);
                    }
                }
            }
        };

        const handleKeyUp = async (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                if (isRecordingRef.current) {
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
        // If already recording, stop and clean up
        if (isRecordingRef.current && mediaRecorderRef.current) {
            try {
                setIsRecording(false);
                isRecordingRef.current = false; // Update both state and ref
                mediaRecorderRef.current.stop();
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                mediaRecorderRef.current = null;
                stopSilenceDetection();
                return;
            } catch (error) {
                console.error('Error stopping recording:', error);
            }
        } else {
            // Start new recording
            try {
                // Check if MediaRecorder is supported
                if (!MediaRecorder.isTypeSupported('audio/webm')) {
                    throw new Error('audio/webm format not supported');
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream, { 
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: 128000 // Set a reasonable bitrate
                });
            
                // Verify recorder is ready
                if (!recorder) {
                    throw new Error('Failed to create MediaRecorder');
                }
            
                mediaRecorderRef.current = recorder;
                setIsRecording(true);
                isRecordingRef.current = true; // Update both state and ref
                
                // Store the stream so we can clean it up later
                const currentStream = stream;
                const threadId = currentThreadIdRef.current;
                
                // Store chunks in a local array
                const chunks: Blob[] = [];
                
                recorder.ondataavailable = (e) => {
                    chunks.push(e.data);
                };

                recorder.onstop = async () => {
                    try {
                        // Combine audio chunks
                        const audioBlob = new Blob(chunks, { type: 'audio/webm' });

                        // Convert WebM to WAV using AudioContext and resample to 16kHz
                        const audioContext = new AudioContext();
                        setIsRecording(false);
                        isRecordingRef.current = false; // Update both state and ref
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

                        if (currentChannelId) {
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
                        if (audioContextRef.current) {
                            audioContextRef.current.close();
                        }
                        mediaRecorderRef.current = null;
                        setIsRecording(false);
                        isRecordingRef.current = false; // Update both state and ref
                        stopSilenceDetection();
                    }
                };

                // Setup audio analysis for silence detection
                try {
                    console.log('Initializing audio context and analyser');
                    audioContextRef.current = new AudioContext();
                    
                    // Wait for audio context to be ready
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    analyserRef.current = audioContextRef.current.createAnalyser();
                    analyserRef.current.fftSize = ANALYZER_FFT_SIZE;
                    analyserRef.current.smoothingTimeConstant = 0.8; // Smoother volume changes
                    
                    // Create a new MediaStream from the original stream
                    const audioStream = new MediaStream();
                    stream.getAudioTracks().forEach(track => audioStream.addTrack(track));
                    
                    sourceRef.current = audioContextRef.current.createMediaStreamSource(audioStream);
                    
                    // Add a gain node to boost quiet signals
                    const gainNode = audioContextRef.current.createGain();
                    gainNode.gain.value = 2.0; // Boost signal by 2x
                    
                    // Connect nodes: source -> gain -> analyser
                    sourceRef.current.connect(gainNode);
                    gainNode.connect(analyserRef.current);
                    
                    // Add a small delay to ensure audio is flowing
                    await new Promise(resolve => setTimeout(resolve, 200));
                
                    console.log('Audio analysis setup complete');
                } catch (error) {
                    console.error('Error setting up audio analysis:', error);
                    // Fall back to manual stop if analysis fails
                    setTimeout(() => {
                        if (isRecordingRef.current) {
                            handleRecording();
                        }
                    }, 10000); // Auto-stop after 10 seconds
                }
                
                // Start recording with 100ms time slices for better silence detection
                recorder.start(100);

                // Start silence detection after a short delay to ensure everything is ready
                setTimeout(() => {
                    if (isRecordingRef.current && analyserRef.current) {
                        startSilenceDetection();
                    }
                }, 500);
            } catch (error) {
                console.error('Error starting recording:', error);
            }
        }
    };
    
    const startSilenceDetection = useCallback(() => {
        if (!isRecordingRef.current) {
            console.log('Not starting silence detection - recording not active');
            return;
        }

        if (!analyserRef.current) {
            console.error('Analyser not initialized - cannot start silence detection');
            return;
        }

        console.log('Starting silence detection');

        const checkSilence = async () => {
            if (!analyserRef.current || !isRecordingRef.current) {
                console.log('Silence detection stopped - analyser not ready or recording ended');
                return;
            }
            
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            analyserRef.current.getFloatTimeDomainData(dataArray);
            
            // Calculate RMS (root mean square) of the audio signal
            let sum = 0;
            let validSamples = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const sample = dataArray[i];
                // Only count valid samples (non-zero, non-NaN)
                if (sample !== 0 && !isNaN(sample)) {
                    sum += sample * sample;
                    validSamples++;
                }
            }
            
            // If we have no valid samples, skip this analysis
            if (validSamples === 0) {
                console.log('No valid audio samples detected - checking audio stream');
                // Check if audio stream is still active
                if (sourceRef.current?.mediaStream?.active === false) {
                    console.log('Audio stream is not active');
                    return;
                }
                // Wait a bit and try again
                await new Promise(resolve => setTimeout(resolve, 100));
                return;
            }
            
            const rms = Math.sqrt(sum / validSamples);
            const dB = rms > 0 ? 20 * Math.log10(rms) : MIN_VALID_VOLUME;
            
            // Debug log the raw audio data
            // console.log('Audio samples:', Array.from(dataArray).slice(0, 10));
            
            // Skip if volume is too low to be valid
            if (dB < MIN_VALID_VOLUME) {
                console.log(`Invalid audio level detected: ${dB.toFixed(2)} dB`);
                return;
            }
            
            // console.log(`Audio level: ${dB.toFixed(2)} dB`); // Debug log
            
            // Only consider it silence if we've had valid sound first
            if (dB > SOUND_THRESHOLD) {
                // console.log(`Active speech detected (${dB.toFixed(2)} dB > ${SOUND_THRESHOLD} dB)`);
                if (silenceTimer.current) {
                    console.log('Resetting silence timer');
                    window.clearTimeout(silenceTimer.current);
                    silenceTimer.current = null;
                }
            } else if (dB < SILENCE_THRESHOLD && dB > MIN_VALID_VOLUME) {
                // console.log(`Quiet period detected (${dB.toFixed(2)} dB < ${SILENCE_THRESHOLD} dB)`);
                if (!silenceTimer.current) {
                    console.log(`Starting silence timer (${SILENCE_DURATION}ms)`);
                    silenceTimer.current = window.setTimeout(() => {
                        console.log('Silence duration reached, stopping recording');
                        if (isRecordingRef.current) {
                            handleRecording();
                        }
                    }, SILENCE_DURATION);
                }
            }
        };

        // Start checking every 100ms
        silenceDetectionInterval.current = window.setInterval(checkSilence, 100);
    }, [isRecordingRef]);

    const stopSilenceDetection = () => {
        if (silenceTimer.current) {
            window.clearTimeout(silenceTimer.current);
            silenceTimer.current = null;
        }
        if (silenceDetectionInterval.current) {
            window.clearInterval(silenceDetectionInterval.current);
            silenceDetectionInterval.current = null;
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
