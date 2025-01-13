import React, { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/DataContext';

interface CommandInputProps {
    onSendMessage: (message: string) => void;
    currentChannel: string|null;
}

const COMMANDS = [
    { command: '/retry', description: 'Retry last message' },
    { command: '/artifacts', description: 'List artifacts in current thread' },
    { command: '/tasks', description: 'List tasks in current thread' },
    { command: '/channel', description: 'Send message to channel root' }
];

export const CommandInput: React.FC<CommandInputProps> = ({ currentChannel, onSendMessage }) => {
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { channels, handles } = useWebSocket();
    
    // Get handles filtered by current channel members
    const userHandles = React.useMemo(() => {
        if (!currentChannel) return handles.map(h => h.handle);
        
        const channel = channels.find(c => c.id === currentChannel);
        if (!channel) return handles.map(h => h.handle);
        
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInput(value);

        // Handle command suggestions
        if (value.startsWith('/')) {
            const filtered = COMMANDS
                .filter(cmd => cmd.command.toLowerCase().startsWith(value.toLowerCase()))
                .map(cmd => `${cmd.command} - ${cmd.description}`);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        }
        // Handle user handle suggestions
        else if (value.includes('@')) {
            const lastWord = value.split(' ').pop() || '';
            if (lastWord.startsWith('@')) {
                const filtered = userHandles.filter(handle => 
                    handle.toLowerCase().startsWith(lastWord.toLowerCase())
                );
                setSuggestions(filtered);
                setShowSuggestions(filtered.length > 0);
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    };

    const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && input.trim()) {
            // Special handling for /artifacts and /tasks commands
            if (input.trim() === '/artifacts' || input.trim() === '/tasks') {
                // These commands are handled by the UI through the WebSocket context
                // So we just pass them through
                onSendMessage(input.trim());
                setInput('');
                setShowSuggestions(false);
                return;
            }

            onSendMessage(input.trim());
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

    const handleSuggestionClick = (suggestion: string) => {
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
        inputRef.current?.focus();
    };

    return (
        <div className="command-input">
            <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                placeholder="Type a message... (Use / for commands, @ for mentions)"
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
                        backgroundColor: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        zIndex: 1000,
                        maxHeight: '200px',
                        overflowY: 'auto'
                    }}
                >
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            className="suggestion-item"
                            onClick={() => handleSuggestionClick(suggestion)}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
