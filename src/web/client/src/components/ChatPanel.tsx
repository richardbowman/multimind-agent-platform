import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
    const [userId] = useState('user-' + Math.random().toString(36).substr(2, 9));
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

        const message = {
            channel_id: currentChannelId,
            thread_id: currentThreadId || undefined,
            message: content,
            user_id: userId,
            create_at: Date.now(),
            props: {}
        };
        
        sendMessage(message);
    };

    return (
        <div className="chat-panel">
            <div className="messages">
                {messages
                    .filter(message => 
                        // If we're in a thread, only show messages from that thread
                        // If we're not in a thread, only show messages without a thread_id
                        currentThreadId 
                            ? message.thread_id === currentThreadId
                            : !message.thread_id
                    )
                    .map((message) => (
                        <div key={message.id} className="message">
                            <div className="message-header">
                                <span className="username">{message.user_id}</span>
                                <span className="timestamp">
                                    {new Date(message.create_at).toLocaleString()}
                                </span>
                            </div>
                            <div className="message-content">
                                <ReactMarkdown>{message.message}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                <div ref={messagesEndRef} />
            </div>
            <CommandInput onSendMessage={handleSendMessage} />
        </div>
    );
};
