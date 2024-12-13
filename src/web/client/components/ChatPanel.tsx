import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatPost } from '../../../chat/chatClient';
import { CommandInput } from './CommandInput';
import { WebSocketMessage, ChatMessage } from '../../shared/types';

interface ChatPanelProps {
    currentChannelId: string | null;
    currentThreadId: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    currentChannelId,
    currentThreadId,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const ws = new WebSocket(`ws://${window.location.host}`);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            setWsConnection(ws);
        };

        ws.onmessage = (event) => {
            const message: WebSocketMessage = JSON.parse(event.data);
            if (message.type === 'CHAT') {
                handleIncomingMessage(message.payload);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            setWsConnection(null);
        };

        return () => {
            ws.close();
        };
    }, []);

    const handleIncomingMessage = (message: ChatMessage) => {
        if (message.channelId === currentChannelId &&
            (!currentThreadId || message.threadId === currentThreadId)) {
            setMessages(prev => [...prev, message]);
        }
    };

    const handleSendMessage = async (content: string) => {
        if (!wsConnection || !currentChannelId) return;

        const message: WebSocketMessage = {
            type: 'CHAT',
            action: 'CREATE',
            payload: {
                channelId: currentChannelId,
                threadId: currentThreadId,
                content,
                timestamp: Date.now(),
            }
        };

        wsConnection.send(JSON.stringify(message));
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
