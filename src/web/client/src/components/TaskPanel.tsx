import React, { useEffect } from 'react';
import './TaskPanel.css';
import { TaskStatus } from '../../../../schemas/reviewProgress';
import { useWebSocket } from '../contexts/DataContext';

interface TaskPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ channelId, threadId }) => {
    const { tasks, fetchTasks } = useWebSocket();

    useEffect(() => {
        let isSubscribed = true;

        const loadTasks = async () => {
            if (channelId && isSubscribed) {
                await fetchTasks(channelId, threadId);
            }
        };

        loadTasks();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);

    return (
        <div className="task-panel">
            <h2>Tasks</h2>
            <ul>
                {(tasks || []).map(task => (
                    <li key={task.id} className={`task-item ${task.complete ? 'status-complete' : (task.inProgress ? 'status-in-progress' : 'status-not-started')}`}>
                        <span className="task-status">
                            {task.complete ? 'Complete' : (task.inProgress ? 'In Progress' : 'Not Started')}
                        </span>
                        <span className="task-description">{task.description}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
