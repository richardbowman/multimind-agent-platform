import React, { useState, useEffect } from 'react';
import { Thread } from '../../../shared/types';

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
    const [threads, setThreads] = useState<Thread[]>([]);

    useEffect(() => {
        if (!channelId) {
            setThreads([]);
            return;
        }

        // TODO: Replace with actual WebSocket connection
        const mockThreads: Thread[] = [
            { id: 'thread1', channelId, rootMessageId: 'msg1' },
            { id: 'thread2', channelId, rootMessageId: 'msg2' },
        ];
        setThreads(mockThreads);
    }, [channelId]);

    if (!channelId) {
        return <div className="thread-list">Select a channel to view threads</div>;
    }

    return (
        <div className="thread-list">
            <h2>Threads</h2>
            <ul>
                {threads.map(thread => (
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
