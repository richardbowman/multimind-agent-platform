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
                {channelThreads.map(thread => (
                    <li
                        key={thread.id}
                        className={`thread-item ${currentThreadId === thread.id ? 'active' : ''}`}
                        onClick={() => onThreadSelect(thread.id)}
                    >
                        Thread {thread.id}
                    </li>
                ))}
            </ul>
        </div>
    );
};
