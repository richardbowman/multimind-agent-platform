import React, { useEffect } from 'react';
import { Thread } from '../../../shared/types';
import { useWebSocket } from '../contexts/WebSocketContext';

interface ThreadListProps {
    channelId: string | null;
    onThreadSelect: (threadId: string) => void;
    currentThreadId: string | null;
}

export const ThreadList: React.FC<ThreadListProps> = ({
    channelId,
    onThreadSelect,
    currentThreadId
}) => {
    const { threads, fetchThreads } = useWebSocket();

    useEffect(() => {
        if (channelId) {
            fetchThreads(channelId);
        }
    }, [channelId, fetchThreads]);

    const channelThreads = channelId ? threads[channelId] || [] : [];

    if (!channelId) {
        return <div className="thread-list">Select a channel to view threads</div>;
    }

    return (
        <div className="thread-list">
            <h2>Threads</h2>
            <ul>
                <li
                    key="root"
                    className={`thread-item ${currentThreadId === null ? 'active' : ''}`}
                    onClick={() => onThreadSelect('')}
                >
                    <div className="thread-content">
                        <div className="thread-title">Main Channel</div>
                        <div className="thread-meta">Channel Root</div>
                    </div>
                </li>
                {channelThreads.map(thread => (
                    <li
                        key={thread.rootMessage.id}
                        className={`thread-item ${currentThreadId === thread.rootMessage.id ? 'active' : ''}`}
                        onClick={() => onThreadSelect(thread.rootMessage.id)}
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
