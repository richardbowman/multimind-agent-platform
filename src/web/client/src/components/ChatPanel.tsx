import React, { useEffect, useRef, useState } from 'react';
import { CommandInput } from './CommandInput';
import { useWebSocket } from '../contexts/WebSocketContext';
import webSocketService from '../services/WebSocketService';

interface ChatPanelProps {
    currentChannelId: string | null;
    currentThreadId: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    currentChannelId,
    currentThreadId,
}) => {
    const { messages, sendMessage } = useWebSocket();
    const [localMessages, setMessages] = useState([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (currentChannelId) {
            webSocketService.fetchMessages(currentChannelId, currentThreadId);
        }
        scrollToBottom();
    }, [currentChannelId, currentThreadId]);

    const handleSendMessage = async (content: string) => {
        if (!currentChannelId) return;

        const messageId = Date.now().toString();
        const message = {
            id: messageId,
            channel_id: currentChannelId,
            thread_id: currentThreadId || undefined,
            message: content,
            create_at: Date.now(),
        };
        
        // Optimistically add message to local state
        setMessages(prev => [...prev, message]);
        
        // Send to server
        sendMessage(message);
    };

    return (
        <div className="chat-panel">
            <div className="messages">
                {messages.map((message) => (
                    <div key={message.id} className="message">
                        <div className="message-header">
                            <span className="username">{message.userId}</span>
                            <span className="timestamp">
                                {new Date(message.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <div className="message-content">{message.content}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <CommandInput onSendMessage={handleSendMessage} />
        </div>
    );
};
