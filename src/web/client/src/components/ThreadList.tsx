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
                    (Root) - Main Channel
                </li>
                {channelThreads.map(thread => (
                    <li
                        key={thread.rootMessage.id}
                        className={`thread-item ${currentThreadId === thread.rootMessage.id ? 'active' : ''}`}
                        onClick={() => onThreadSelect(thread.rootMessage.id)}
                    >
                        {thread.rootMessage.message.substring(0, 50)}
                        {thread.rootMessage.message.length > 50 ? '...' : ''}
                        <div className="thread-meta">
                            {thread.replies.length} replies • Last activity: {new Date(thread.last_message_at).toLocaleString()}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};
