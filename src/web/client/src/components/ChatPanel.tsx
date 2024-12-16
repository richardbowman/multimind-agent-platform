import React, { useEffect, useRef } from 'react';
import { CommandInput } from './CommandInput';
import { useWebSocket } from '../contexts/WebSocketContext';

interface ChatPanelProps {
    currentChannelId: string | null;
    currentThreadId: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    currentChannelId,
    currentThreadId,
}) => {
    const { messages, sendMessage } = useWebSocket();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (currentChannelId) {
            // Fetch messages whenever channel or thread changes
            sendMessage({
                channel_id: currentChannelId,
                thread_id: currentThreadId || '',
                limit: 50
            });
        }
        scrollToBottom();
    }, [currentChannelId, currentThreadId, messages]);

    const handleSendMessage = async (content: string) => {
        if (!currentChannelId) return;

        sendMessage({
            channel_id: currentChannelId,
            thread_id: currentThreadId || undefined,
            message: content,
            create_at: Date.now(),
        });
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
