import React, { useState, useEffect, useRef } from 'react';
import { ChatPost } from '../../../chat/chatClient';
import { CommandInput } from './CommandInput';

interface ChatPanelProps {
    currentChannelId: string | null;
    currentThreadId: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    currentChannelId,
    currentThreadId,
}) => {
    const [messages, setMessages] = useState<ChatPost[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async (message: string) => {
        // TODO: Implement message sending via WebSocket
        console.log('Sending message:', message);
    };

    return (
        <div className="chat-panel">
            <div className="messages">
                {messages.map((post) => (
                    <div key={post.id} className="message">
                        <div className="message-header">
                            <span className="username">{post.user_id}</span>
                            <span className="timestamp">
                                {new Date(post.create_at).toLocaleString()}
                            </span>
                        </div>
                        <div className="message-content">{post.message}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <CommandInput onSendMessage={handleSendMessage} />
        </div>
    );
};
