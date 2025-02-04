import React, { useState, KeyboardEvent, useEffect, useRef, ChangeEvent, useLayoutEffect } from 'react';
import { useDataContext } from '../contexts/DataContext';
import { Artifact } from '../../../../tools/artifact';
import { Settings } from 'electron';
import { AssetSelectionDialog } from './AssetSelectionDialog';
import Attachment from '@mui/icons-material/Attachment';
import Mic from '@mui/icons-material/Mic';
import Stop from '@mui/icons-material/Stop';
import { useIPCService } from '../contexts/IPCContext';

interface CommandInputProps {
    onSendMessage: (message: string, artifactIds?: string[]) => void;
    currentChannel: string | null;
    settings: Settings;
}

const COMMANDS = [
    { command: '/retry', description: 'Retry last message' },
    { command: '/artifacts', description: 'List artifacts in current thread' },
    { command: '/tasks', description: 'List tasks in current thread' },
    { command: '/channel', description: 'Send message to channel root' },
    { command: '/add', description: 'Attach artifacts to message' }
];

export const CommandInput: React.FC<CommandInputProps> = ({ currentChannel, onSendMessage }) => {
    const ipcService = useIPCService();
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Array<{ title: string, type: string, id: string }>>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [showAssetDialog, setShowAssetDialog] = useState(false);
    const [pendingArtifacts, setPendingArtifacts] = useState<Artifact[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { settings, channels, handles, pendingFiles, resetPendingFiles, allArtifacts, showFileDialog } = useDataContext();

    // Get handles filtered by current channel members
    const userHandles = React.useMemo(() => {
        if (!currentChannel) return handles.map(h => h.handle);

        const channel = channels.find(c => c.id === currentChannel);
        if (!channel || !channel.members) return handles.map(h => h.handle);

        // Filter handles to only those in the current channel
        return handles
            .filter(h => channel.members.includes(h.id))
            .map(h => h.handle);
    }, [handles, channels, currentChannel]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const simulateTyping = (text: string, index: number = 0) => {
        if (index < text.length) {
            setInput((prev) => prev + text[index]);
            setTimeout(() => simulateTyping(text, index + 1), 50); // Adjust the delay as needed
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;

        if (e.nativeEvent.inputType === 'insertFromPaste' && settings?.simulateTypingOnPaste) {
            setInput(''); // Clear the input first
            simulateTyping(value);
        } else {
            setInput(value);

            // Handle command suggestions
            if (value.startsWith('/')) {
                if (value.startsWith('/add ')) {
                    // Show artifact suggestions
                    const searchTerm = value.slice(5).toLowerCase();
                    const filtered = allArtifacts
                        .filter(artifact =>
                            artifact.type?.toLowerCase().includes(searchTerm) ||
                            artifact.id?.toLowerCase().includes(searchTerm) ||
                            artifact.metadata?.title?.toLowerCase().includes(searchTerm)
                        )
                        .map(artifact => ({
                            title: artifact.metadata?.title,
                            type: 'artifact',
                            id: artifact.id
                        }));
                    setSuggestions(filtered);
                    setShowSuggestions(filtered.length > 0);
                } else {
                    const filtered = COMMANDS
                        .filter(cmd => cmd.command.toLowerCase().startsWith(value.toLowerCase()))
                        .map(cmd => `${cmd.command} - ${cmd.description}`);
                    setSuggestions(filtered);
                    setShowSuggestions(filtered.length > 0);
                }
            }
            // Handle user handle suggestions
            else if (value.includes('@')) {
                const lastWord = value.split(' ').pop() || '';
                if (lastWord.startsWith('@')) {
                    const filtered = userHandles
                        .filter(handle =>
                            handle.toLowerCase().startsWith(lastWord.toLowerCase())
                        )
                        .map(handle => ({
                            title: handle,
                            type: 'user',
                            id: handle
                        }));
                    setSuggestions(filtered);
                    setShowSuggestions(filtered.length > 0);
                } else {
                    setShowSuggestions(false);
                }
            } else {
                setShowSuggestions(false);
            }
        }
    };

    const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && input.trim() && !event.shiftKey) {
            // Special handling for /artifacts, /tasks, and /add commands
            if (input.trim() === '/artifacts' || input.trim() === '/tasks') {
                // These commands are handled by the UI through the WebSocket context
                // So we just pass them through
                onSendMessage(input.trim());
                setInput('');
                setShowSuggestions(false);
                return;
            }

            // Handle /add command with artifact IDs
            if (input.trim().startsWith('/add')) {
                const artifactIds = input
                    .slice(5) // Remove '/add '
                    .split(',') // Split multiple artifact IDs
                    .map(id => id.trim())
                    .filter(id => id.length > 0);

                // Find full artifact info including titles
                const newArtifacts = allArtifacts.filter(a =>
                    artifactIds.includes(a.id)
                );

                // Add to existing pending artifacts if any
                const updatedArtifacts = [
                    ...pendingArtifacts,
                    ...newArtifacts.filter(newArtifact =>
                        !pendingArtifacts.some(existing => existing.id === newArtifact.id)
                    )
                ];

                // Store the artifacts for the next message
                setPendingArtifacts(updatedArtifacts);
                setInput('');
                setShowSuggestions(false);
                event.preventDefault();
                event.stopPropagation();

                return;
            }

            // Regular message - send with any pending artifact IDs
            onSendMessage(input.trim(), [
                ...pendingArtifacts.map(a => a.id),
                ...pendingFiles.map(a => a.id)
            ]);
            setPendingArtifacts([]);
            resetPendingFiles();
            setInput('');
            setShowSuggestions(false);
            // Reset textarea height
            if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = '40px';
            }

            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === 'Tab' && showSuggestions) {
            event.preventDefault();
            const suggestion = suggestions[0];
            if (suggestion) {
                if (suggestion.includes(' - ')) {
                    // Command suggestion
                    setInput(suggestion.split(' - ')[0] + ' ');
                } else {
                    // Handle suggestion
                    const words = input.split(' ');
                    words[words.length - 1] = suggestion;
                    setInput(words.join(' ') + ' ');
                }
                setShowSuggestions(false);
            }
        } else if (event.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion: { title: string, type: string, id: string }) => {
        if (suggestion.type === 'artifact') {
            // Artifact suggestion - add to current input
            const currentInput = input.startsWith('/add') ? input : '/add ';
            const existingIds = currentInput.slice(5).split(',').map(id => id.trim());

            // Add new ID if not already present
            if (!existingIds.includes(suggestion.id)) {
                const newInput = existingIds[0]
                    ? `${currentInput},${suggestion.id}`
                    : `${currentInput}${suggestion.id}`;
                setInput(newInput);
            }
        } else if (suggestion.type === 'user') {
            // Handle suggestion
            const words = input.split(' ');
            words[words.length - 1] = suggestion.title;
            setInput(words.join(' ') + ' ');
        } else if (suggestion.includes(' - ')) {
            // Command suggestion
            setInput(suggestion.split(' - ')[0] + ' ');
        } else {
            // Handle suggestion
            const words = input.split(' ');
            words[words.length - 1] = suggestion;
            setInput(words.join(' ') + ' ');
        }
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    return (
        <div className="command-input">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                    <button
                        style={{
                            cursor: 'pointer',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: '#444',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            transition: 'all 0.2s ease',
                            position: 'relative'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAttachmentMenu(prev => !prev);
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#555';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#444';
                        }}
                    >
                        <Attachment />
                        {pendingArtifacts.length > 0 || pendingFiles.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                backgroundColor: '#646cff',
                                color: '#fff',
                                borderRadius: '50%',
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold'
                            }}>
                                {pendingArtifacts.length + pendingFiles.length}
                            </div>
                        )}
                    </button>
                    {showAttachmentMenu && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                backgroundColor: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                padding: '8px',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}
                        >
                            <button
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: '#444',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    whiteSpace: 'nowrap'
                                }}
                                onClick={() => {
                                    showFileDialog();
                                    setShowAttachmentMenu(false);
                                }}
                            >
                                Attach File
                            </button>
                            <button
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: '#444',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    whiteSpace: 'nowrap'
                                }}
                                onClick={() => {
                                    setShowAssetDialog(true);
                                    setShowAttachmentMenu(false);
                                }}
                            >
                                Attach Asset
                            </button>
                        </div>
                    )}
                </div>
                {showAssetDialog && (
                    <AssetSelectionDialog
                        assets={allArtifacts}
                        onSelect={(assetIds) => {
                            const newArtifacts = allArtifacts.filter(a =>
                                assetIds.includes(a.id)
                            );
                            setPendingArtifacts(prev => [
                                ...prev,
                                ...newArtifacts.filter(newArtifact =>
                                    !prev.some(existing => existing.id === newArtifact.id)
                                )
                            ]);
                            setShowAssetDialog(false);
                        }}
                        onClose={() => setShowAssetDialog(false)}
                    />
                )}
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder={
                        pendingArtifacts.length > 0 || pendingFiles.length > 0
                            ? `Attachments ready (${pendingArtifacts.length} artifacts, ${pendingFiles.length} file attachments)... Type your message`
                            : "Type a message... (Use / for commands, @ for mentions)"
                    }
                    rows={1}
                    style={{
                        width: '100%',
                        minHeight: '40px',
                        maxHeight: '200px',
                        resize: 'none',
                        overflowY: 'hidden',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        lineHeight: '1.5'
                    }}
                    onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                />
                {showSuggestions && (
                    <div
                        ref={suggestionsRef}
                        className="suggestions-dropdown"
                        style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: '#2a2a2a',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            zIndex: 1000,
                            maxHeight: suggestions.length > 5 ? '400px' : '200px',
                            overflowY: 'auto',
                            color: '#fff'
                        }}
                    >
                        {suggestions.map((suggest, index) => (
                            <div
                                key={index}
                                className="suggestion-item"
                                onClick={() => handleSuggestionClick(suggest)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #444',
                                    color: '#fff',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <div style={{ fontWeight: 'bold' }}>{suggest.title}</div>
                                <div style={{ fontSize: '0.9em', color: '#aaa' }}>Type: {suggest.type}</div>
                                <div style={{ fontSize: '0.8em', color: '#888' }}>ID: {suggest.id}</div>
                            </div>
                        ))}
                    </div>
                )}
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
                    onClick={async () => {
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
                            setAudioChunks([]);

                            recorder.ondataavailable = (e) => {
                                setAudioChunks((prev) => [...prev, e.data]);
                            };

                            recorder.onstop = async () => {
                                // Combine audio chunks
                                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                                // Convert to base64
                                const reader = new FileReader();
                                const audioBase64 = await new Promise<string>((resolve, reject) => {
                                    reader.onload = () => {
                                        if (typeof reader.result === 'string') {
                                            // Remove data URL prefix
                                            const base64 = reader.result.split(',')[1];
                                            resolve(base64);
                                        } else {
                                            reject(new Error('Failed to read audio as base64'));
                                        }
                                    };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(audioBlob);
                                });

                                // Send for transcription
                                if (currentChannel) {
                                    try {
                                        const message = await ipcService.getRPC().transcribeAndSendAudio({
                                            audioBase64,
                                            channelId: currentChannel,
                                            threadId: null,
                                            language: 'en'
                                        });
                                        onSendMessage(message.message);
                                    } catch (error) {
                                        console.error('Transcription failed:', error);
                                    }
                                }

                                // Clean up
                                stream.getTracks().forEach(track => track.stop());
                                setMediaRecorder(null);
                                setAudioChunks([]);
                            };

                            recorder.start();
                            setIsRecording(true);
                        } catch (error) {
                            console.error('Error starting recording:', error);
                        }
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = isRecording ? '#ff6666' : '#555';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = isRecording ? '#ff4444' : '#444';
                    }}
                >
                    {isRecording ? <Stop /> : <Mic />}
                </button>
            </div>
            {pendingFiles.length > 0 && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '8px',
                    overflowX: 'auto',
                    padding: '8px 0'
                }}>
                    {pendingFiles.map((file, index) => (
                        <div
                            key={index}
                            style={{
                                position: 'relative',
                                width: '100px',
                                height: '100px',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                flexShrink: 0
                            }}
                        >
                            <img
                                src={
                                    file.metadata?.mimeType?.startsWith('image/')
                                        ? `data:${file.metadata?.mimeType};base64,${typeof file.content === 'string'
                                            ? file.content.replace(/^data:image\/\w+;base64,/, '')
                                            : btoa(String.fromCharCode(...new Uint8Array(file.content as ArrayBuffer)))
                                        }`
                                        : ''
                                }
                                alt={file.metadata?.title || 'Image preview'}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                            <button
                                onClick={() => {
                                    setPendingFiles(prev =>
                                        prev.filter((_, i) => i !== index)
                                    );
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '4px',
                                    right: '4px',
                                    background: 'rgba(0,0,0,0.7)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '20px',
                                    height: '20px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
