import React, { useState, useEffect } from 'react';
import { TaskStatus } from '../../../../schemas/reviewProgress';

interface TaskPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ channelId, threadId }) => {
    const { tasks, fetchTasks } = useWebSocket();

    useEffect(() => {
        if (channelId) {
            fetchTasks(channelId, threadId);
        }
    }, [channelId, threadId, fetchTasks]);

    return (
        <div className="task-panel">
            <h2>Tasks</h2>
            <ul>
                {tasks.map(task => (
                    <li key={task.id} className={`task-item status-${task.status.toLowerCase().replace(' ', '-')}`}>
                        <span className="task-status">{task.status}</span>
                        <span className="task-description">{task.description}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
