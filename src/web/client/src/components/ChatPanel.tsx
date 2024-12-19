import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CommandInput } from './CommandInput';
import { Spinner } from './Spinner';
import { useWebSocket } from '../contexts/WebSocketContext';
import webSocketService, { ClientMessage } from '../services/WebSocketService';
import remarkGfm from 'remark-gfm'

interface ChatPanelProps {
    currentChannelId: string | null;
    currentThreadId: string | null;
    setCurrentThreadId: (threadId: string | null) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    currentChannelId,
    currentThreadId,
    setCurrentThreadId,
}) => {
    const { messages, sendMessage, handles } = useWebSocket();
    const [userId] = useState('test');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (currentChannelId) {
            setIsLoading(true);
            webSocketService.fetchMessages(currentChannelId, currentThreadId || '');
        }
    }, [currentChannelId, currentThreadId]);

    // Handle scrolling and loading state
    useEffect(() => {
        if (messages.length > 0) {
            setIsLoading(false);
            scrollToBottom();
        }
    }, [messages.length]);

    // Scroll to bottom when messages are updated or when a message's inProgress status changes
    useEffect(() => {
        if (messages.some(m => m.inProgress)) {
            scrollToBottom();
        }
    }, [messages]);

    // Handle live message thread selection
    useEffect(() => {
        const handleNewMessage = (messages: ClientMessage[], isLive: boolean) => {
            if (!isLive) return; // Only process live messages
            
            const message = messages[0]; // We receive an array but handle one message
            if (message?.thread_id && !currentThreadId) {
                // Only switch to thread view if we're not already in a thread
                const threadRoot = messages.find(m => m.id === message.thread_id);
                if (threadRoot) {
                    setCurrentThreadId(threadRoot.id);
                }
            }
        };

        const cleanup = webSocketService.onMessage(handleNewMessage);
        return cleanup;
    }, [messages, currentThreadId, setCurrentThreadId]);

    const [lastMessage, setLastMessage] = useState<string | null>(null);

    const handleSendMessage = async (content: string) => {
        if (!currentChannelId) return;

        // Handle special commands
        if (content.startsWith('/')) {
            const [command, ...args] = content.split(' ');
            
            switch (command) {
                case '/retry':
                    if (lastMessage) {
                        sendMessage({
                            channel_id: currentChannelId,
                            thread_id: currentThreadId || undefined,
                            message: lastMessage,
                            user_id: userId,
                            create_at: Date.now(),
                            props: {}
                        });
                    }
                    return;
                    
                case '/channel':
                    // Send message to channel root regardless of current thread
                    const channelMessage = args.join(' ');
                    if (channelMessage) {
                        sendMessage({
                            channel_id: currentChannelId,
                            message: channelMessage,
                            user_id: userId,
                            create_at: Date.now(),
                            props: {}
                        });
                    }
                    return;

                default:
                    // If not a special command, send as regular message
                    break;
            }
        }

        // Store non-command messages for /retry
        if (!content.startsWith('/')) {
            setLastMessage(content);
        }

        const message = {
            channel_id: currentChannelId,
            message: content,
            user_id: userId,
            create_at: Date.now(),
            props: currentThreadId ? { 'root-id': currentThreadId } : {}
        };
        
        sendMessage(message);
    };

    return (
        <div className="chat-panel">
            <div className="messages">
                {isLoading ? (
                    <div className="loading-message">Loading messages...</div>
                ) : messages.length === 0 ? (
                    <div className="no-messages">No messages yet</div>
                ) : (
                (messages||[])
                    .filter(message => message.channel_id === currentChannelId)
                    .filter(message => {
                        if (currentThreadId) {
                            // In a thread, show the root message and all replies
                            return message.id === currentThreadId || 
                                   message.props?.['root-id'] === currentThreadId;
                        } else {
                            // In channel view, show only root messages
                            return !message.props?.['root-id'];
                        }
                    })
                    .map((message) => (
                        <div key={message.id} className="message">
                            <div className="message-header">
                                <span className="username">
                                    {(() => {
                                        const handle = handles.find(h => h.id === message.user_id)?.handle;
                                        console.log('ChatPanel: Looking up handle for user_id:', message.user_id, 'Found:', handle);
                                        console.log('ChatPanel: Available handles:', handles);
                                        return handle || 'Unknown User';
                                    })()}
                                </span>
                                <span className="timestamp">
                                    {new Date(message.create_at).toLocaleString()}
                                </span>
                            </div>
                            <div className="message-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.message}</ReactMarkdown>
                                {message.inProgress && <Spinner />}
                                {!currentThreadId && messages.some(m => m.props?.['root-id'] === message.id) && (
                                    <div 
                                        className="thread-indicator"
                                        onClick={() => setCurrentThreadId(message.id)}
                                    >
                                        View thread ({message.reply_count} responses)
                                    </div>
                                )}
                            </div>
                        </div>
                    )))}
                <div ref={messagesEndRef} />
            </div>
            <CommandInput onSendMessage={handleSendMessage} />
        </div>
    );
};
