import React, { useState, KeyboardEvent } from 'react';

interface CommandInputProps {
    onSendMessage: (message: string) => void;
}

export const CommandInput: React.FC<CommandInputProps> = ({ onSendMessage }) => {
    const [input, setInput] = useState('');

    const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="command-input">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
            />
        </div>
    );
};
