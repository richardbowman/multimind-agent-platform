import React, { useState, KeyboardEvent, useEffect, useRef, ChangeEvent, useLayoutEffect } from 'react';
import { ArtifactDrawer } from './ArtifactDrawer';
import { useDataContext } from '../contexts/DataContext';
import { Artifact, ArtifactItem } from '../../../../tools/artifact';
import { Settings } from 'electron';
import { ArtifactSelectionDialog } from './ArtifactSelectionDialog';
import Attachment from '@mui/icons-material/Attachment';
import { MicrophoneButton } from './MicrophoneButton';
import HomeIcon from '@mui/icons-material/Home';
import ChatIcon from '@mui/icons-material/Chat';
import { Box, Menu, MenuItem, IconButton } from '@mui/material';
import { AttachmentCard } from './shared/AttachmentCard';
import { UUID } from '../../../../types/uuid';
import { useArtifacts } from '../contexts/ArtifactContext';
import { useFilteredTasks } from '../contexts/FilteredTaskContext';
import { useChannels } from '../contexts/ChannelContext';
import { useIPCService } from '../contexts/IPCContext';

interface CommandInputProps {
    onSendMessage: (message: string, artifactIds?: UUID[]) => void;
    currentChannel: UUID | null;
    settings: Settings;
    showWelcome: boolean;
    onToggleWelcome: () => void;
}

const COMMANDS = [
    { command: '/retry', description: 'Retry last message' },
    { command: '/artifacts', description: 'List artifacts in current thread' },
    { command: '/tasks', description: 'List tasks in current thread' },
    { command: '/channel', description: 'Send message to channel root' },
    { command: '/add', description: 'Attach artifacts to message' }
];

export const CommandInput: React.FC<CommandInputProps> = ({ 
    currentChannel, 
    onSendMessage, 
    showWelcome, 
    onToggleWelcome 
}) => {
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<Array<{ title: string, type: string, id: string }>>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [showAssetDialog, setShowAssetDialog] = useState(false);
    const [pendingArtifacts, setPendingArtifacts] = useState<ArtifactItem[]>([]);
    const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
    const [loadedArtifact, setLoadedArtifact] = useState<Artifact | null>(null);
    const [lastMessage, setLastMessage] = useState<{ message: string, artifactIds?: UUID[] } | null>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const attachmentButtonRef = useRef<HTMLButtonElement>(null);
    
    const { channels } = useChannels();    
    const { filteredTasks: tasks } = useFilteredTasks();    
    const { artifacts : allArtifacts } = useArtifacts();    
    const ipcService = useIPCService();

    const { 
        settings, 
        handles, 
        pendingFiles, 
        resetPendingFiles, 
        showFileDialog
    } = useDataContext();

    useEffect(() => {
        const loadArtifactContent = async () => {
            if (selectedArtifact) {
                try {
                    const artifact = await ipcService.getRPC().getArtifact(selectedArtifact.id);
                    setLoadedArtifact(artifact);
                } catch (err) {
                    console.error('Error loading artifact content:', err);
                    setLoadedArtifact(null);
                }
            }
        };

        loadArtifactContent();
    }, [selectedArtifact, ipcService]);

    // Get handles filtered by current channel members
    const userHandles = React.useMemo(() => {
        if (!currentChannel) return handles.map(h => h.handle);

        const channel = channels?.find(c => c.id === currentChannel);
        if (!channel || !channel.members) return handles.map(h => h.handle);

        // Filter handles to only those in the current channel
        return handles
            .filter(h => channel!.members!.includes(h.id))
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

            const message = input.trim();
            
            // Handle /retry command
            if (message === '/retry') {
                if (lastMessage) {
                    onSendMessage(lastMessage.message, lastMessage.artifactIds);
                }
            } else {
                // Regular message - send with any pending artifact IDs
                const artifactIds = [
                    ...pendingArtifacts.map(a => a.id),
                    ...pendingFiles.map(a => a.id)
                ];
                onSendMessage(message, artifactIds);
                // Store as last message
                setLastMessage({ message, artifactIds });
            }
            
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
                if (suggestion.title.includes(' - ')) {
                    // Command suggestion
                    setInput(suggestion.title.split(' - ')[0] + ' ');
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
        <Box sx={{flex: 1}}>
            {showSuggestions && (
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        width: '100%'
                    }}>
                    <div
                        ref={suggestionsRef}
                        className="suggestions-dropdown"
                        style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 8px)',
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
                    </div>
                )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                    <Box
                        component="button"
                        ref={attachmentButtonRef}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAttachmentMenu(prev => !prev);
                        }}
                        sx={{
                            cursor: 'pointer',
                            padding: '6px 8px',
                            border: 'none',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            color: 'text.secondary',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            '&:hover': {
                                backgroundColor: 'action.hover'
                            }
                        }}
                    >
                        <Attachment fontSize="small" />
                        {(pendingArtifacts.length > 0 || pendingFiles.length > 0) && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    backgroundColor: 'primary.main',
                                    color: 'primary.contrastText',
                                    borderRadius: '50%',
                                    width: 16,
                                    height: 16,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.625rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                {pendingArtifacts.length + pendingFiles.length}
                            </Box>
                        )}
                    </Box>
                    <Menu
                        open={showAttachmentMenu}
                        onClose={() => setShowAttachmentMenu(false)}
                        anchorEl={attachmentButtonRef.current}
                        anchorOrigin={{
                            vertical: 'top',
                            horizontal: 'left',
                        }}
                        transformOrigin={{
                            vertical: 'bottom',
                            horizontal: 'left',
                        }}
                        sx={{
                            '& .MuiPaper-root': {
                                mt: 1,
                                minWidth: 180,
                            }
                        }}
                    >
                        <MenuItem
                            onClick={() => {
                                showFileDialog();
                                setShowAttachmentMenu(false);
                            }}
                        >
                            Attach File
                        </MenuItem>
                        <MenuItem
                            onClick={() => {
                                setShowAssetDialog(true);
                                setShowAttachmentMenu(false);
                            }}
                        >
                            Attach Asset
                        </MenuItem>
                    </Menu>
                </div>
                {showAssetDialog && 
                <ArtifactSelectionDialog
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
                />}
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
                {tasks && tasks.length > 0 && (
                    <Box sx={{
                        display: 'flex',
                        backgroundColor: 'background.paper',
                        borderRadius: '6px',
                        padding: '4px',
                        marginLeft: '8px'
                    }}>
                        <Box
                            component="button"
                            onClick={() => onToggleWelcome(false)}
                            sx={{
                                cursor: 'pointer',
                                padding: '6px 8px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: showWelcome ? 'transparent' : 'primary.main',
                                color: showWelcome ? 'text.secondary' : 'primary.contrastText',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    backgroundColor: showWelcome ? 'action.hover' : 'primary.dark'
                                }
                            }}
                            title="Switch to Chat View"
                        >
                            <ChatIcon fontSize="small" />
                        </Box>
                        <Box
                            component="button"
                            onClick={() => onToggleWelcome(true)}
                            sx={{
                                cursor: 'pointer',
                                padding: '6px 8px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: showWelcome ? 'primary.main' : 'transparent',
                                color: showWelcome ? 'primary.contrastText' : 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    backgroundColor: showWelcome ? 'primary.dark' : 'action.hover'
                                }
                            }}
                            title="Switch to Welcome View"
                        >
                            <HomeIcon fontSize="small" />
                        </Box>
                    </Box>
                )}
                <MicrophoneButton />
            </div>
            {(pendingFiles.length > 0 || pendingArtifacts.length > 0) && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginTop: '8px',
                    padding: '8px 0',
                    maxWidth: '100%'
                }}>
                    {pendingFiles.map((file, index) => {
                        const previewUrl = file.metadata?.mimeType?.startsWith('image/')
                            ? `data:${file.metadata?.mimeType};base64,${typeof file.content === 'string'
                                ? file.content.replace(/^data:image\/\w+;base64,/, '')
                                : btoa(String.fromCharCode(...new Uint8Array(file.content as ArrayBuffer)))
                            }`
                            : undefined;

                        return (
                            <AttachmentCard
                                key={`file-${index}`}
                                type="file"
                                title={file.metadata?.title || 'Image preview'}
                                previewUrl={previewUrl}
                                onRemove={() => {
                                    setPendingFiles(prev =>
                                        prev.filter((_, i) => i !== index)
                                    );
                                }}
                            />
                        );
                    })}
                    {pendingArtifacts.map((artifact, index) => (
                        <AttachmentCard
                            key={`artifact-${index}`}
                            type="artifact"
                            title={artifact.metadata?.title || 'Untitled Artifact'}
                            subtitle={artifact.type}
                            onRemove={() => {
                                setPendingArtifacts(prev =>
                                    prev.filter((_, i) => i !== index)
                                );
                            }}
                            onClick={() => {
                                setSelectedArtifact(artifact);
                            }}
                        />
                    ))}
                </div>
            )}
            {loadedArtifact && (
                <ArtifactDrawer
                    open={!!loadedArtifact}
                    onClose={() => {
                        setSelectedArtifact(null);
                        setLoadedArtifact(null);
                    }}
                    currentArtifact={loadedArtifact}
                    actions={[
                        {
                            label: 'Close',
                            onClick: () => setSelectedArtifact(null),
                            variant: 'outlined'
                        }
                    ]}
                />
            )}
        </Box>
    );
};
