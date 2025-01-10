import React, { useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/DataContext';

interface ThreadListProps {
    channelId: string | null;
}

export const ThreadList: React.FC<ThreadListProps> = ({
    channelId
}) => {
    const { messages, currentThreadId, setCurrentThreadId } = useWebSocket();
    const activeThreadRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
        if (activeThreadRef.current) {
            activeThreadRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentThreadId]);

    if (!channelId) {
        return <div className="thread-list">Select a channel to view threads</div>;
    }

    // Get root messages that have replies
    const threadsInChannel = messages
        .filter(msg => msg.channel_id === channelId && !msg.props?.['root-id'])
        .filter(msg => messages.some(reply => reply.props?.['root-id'] === msg.id))
        .map(rootMsg => ({
            rootMessage: rootMsg,
            replies: messages.filter(msg => msg.props?.['root-id'] === rootMsg.id),
            last_message_at: Math.max(
                rootMsg.create_at,
                ...messages
                    .filter(msg => msg.props?.['root-id'] === rootMsg.id)
                    .map(msg => msg.create_at)
            )
        }))
        .sort((a, b) => b.last_message_at - a.last_message_at);

    return (
        <div className="thread-list">
            <h2>Threads</h2>
            <ul>
                <li
                    ref={currentThreadId === null ? activeThreadRef : null}
                    key="root"
                    className={`thread-item ${currentThreadId === null ? 'active' : ''}`}
                    onClick={() => setCurrentThreadId(null)}
                >
                    <div className="thread-content">
                        <div className="thread-title">Main Channel</div>
                        <div className="thread-meta">Channel Root</div>
                    </div>
                </li>
                {threadsInChannel.map(thread => (
                    <li
                        ref={currentThreadId === thread.rootMessage.id ? activeThreadRef : null}
                        key={thread.rootMessage.id}
                        className={`thread-item ${currentThreadId === thread.rootMessage.id ? 'active' : ''}`}
                        onClick={() => setCurrentThreadId(thread.rootMessage.id)}
                    >
                        <div className="thread-content">
                            <div className="thread-title">
                                {thread.rootMessage.message.substring(0, 50)}
                                {thread.rootMessage.message.length > 50 ? '...' : ''}
                            </div>
                            <div className="thread-meta">
                                <span className="reply-count">{thread.replies.length} replies</span>
                                <span className="activity-time">
                                    {new Date(thread.last_message_at).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};
