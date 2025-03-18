import React, { useEffect, useRef } from 'react';
import { 
    Box, 
    Typography, 
    List, 
    IconButton,
    Tooltip,
    ToggleButtonGroup,
    ToggleButton
} from '@mui/material';
import { useTasks } from '../contexts/TaskContext';
import { TaskCard } from './TaskCard';
import { useDataContext } from '../contexts/DataContext';

export const TaskStatusPanel: React.FC = () => {
    const { tasks } = useTasks();
    const { handles } = useDataContext();
    const taskListRef = useRef<HTMLUListElement>(null);

    // Auto-scroll to first in-progress task
    useEffect(() => {
        if (taskListRef.current) {
            const inProgressTask = taskListRef.current.querySelector('[data-status="inProgress"]');
            if (inProgressTask) {
                inProgressTask.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [tasks]);

    return (
        <Box sx={{ 
            p: 2, 
            width: 400,
            maxHeight: 600,
            overflowY: 'hidden', 
            display: 'flex', 
            flexDirection: 'column' 
        }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
                System Task Status
            </Typography>
            
            <List 
                ref={taskListRef}
                sx={{ 
                    flex: 1,
                    overflowY: 'auto',
                    '& > *:not(:last-child)': {
                        mb: 1
                    }
                }}
            >
                {tasks
                    .sort((a, b) => {
                        // Status priority: in-progress > not started > cancelled > completed
                        const statusPriority = {
                            'inProgress': 0,
                            'notStarted': 1,
                            'cancelled': 2,
                            'completed': 3
                        };
                        
                        const aPriority = statusPriority[a.status] || 1;
                        const bPriority = statusPriority[b.status] || 1;
                        
                        if (aPriority < bPriority) return -1;
                        if (aPriority > bPriority) return 1;
                        return 0;
                    })
                    .map(task => (
                        <TaskCard 
                            key={task.id}
                            task={task}
                            data-status={task.status}
                            onClick={() => {}}
                            onCheckboxClick={() => {}}
                        />
                    ))}
            </List>
        </Box>
    );
};
