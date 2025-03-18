import React, { useMemo } from 'react';
import { 
    Box, 
    Typography,
    List,
    ListItem,
    Paper,
    Stack
} from '@mui/material';
import { useTasks } from '../contexts/TaskContext';
import { TaskCard } from './TaskCard';
import { TaskStatus } from '../../../../schemas/TaskStatus';

export const TaskStatusPanel: React.FC = () => {
    const { tasks } = useTasks();

    // Group tasks by status with most recent first
    const groupedTasks = useMemo(() => {
        const groups: Record<TaskStatus, typeof tasks> = {
            [TaskStatus.Pending]: [],
            [TaskStatus.InProgress]: [],
            [TaskStatus.Completed]: [],
            [TaskStatus.Cancelled]: []
        };

        // Sort by creation date (newest first)
        const sortedTasks = [...tasks].sort((a, b) => 
            new Date(b.create_at).getTime() - new Date(a.create_at).getTime()
        );

        // Group by status
        sortedTasks.forEach(task => {
            groups[task.status].push(task);
        });

        return groups;
    }, [tasks]);

    const statusColors = {
        [TaskStatus.Pending]: 'warning.light',
        [TaskStatus.InProgress]: 'info.light',
        [TaskStatus.Completed]: 'success.light',
        [TaskStatus.Cancelled]: 'error.light'
    };

    const statusLabels = {
        [TaskStatus.Pending]: 'Pending',
        [TaskStatus.InProgress]: 'In Progress',
        [TaskStatus.Completed]: 'Completed',
        [TaskStatus.Cancelled]: 'Cancelled'
    };

    return (
        <Box sx={{ 
            p: 2, 
            width: '90vw',
            maxWidth: 1200,
            height: '80vh',
            overflow: 'auto'
        }}>
            <Typography variant="h4" sx={{ mb: 3 }}>
                Task Board
            </Typography>
            
            <Stack direction="row" spacing={2} sx={{ height: '100%' }}>
                {Object.entries(groupedTasks).map(([status, tasks]) => (
                    <Paper 
                        key={status}
                        sx={{ 
                            flex: 1,
                            minWidth: 250,
                            p: 2,
                            bgcolor: statusColors[status as TaskStatus],
                            borderRadius: 2
                        }}
                    >
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {statusLabels[status as TaskStatus]} ({tasks.length})
                        </Typography>
                        
                        <List sx={{ 
                            height: 'calc(100% - 56px)', 
                            overflowY: 'auto',
                            '& > *:not(:last-child)': {
                                mb: 1
                            }
                        }}>
                            {tasks.map(task => (
                                <ListItem key={task.id} sx={{ p: 0 }}>
                                    <TaskCard 
                                        task={task}
                                        onClick={() => {}}
                                        onCheckboxClick={() => {}}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                ))}
            </Stack>
        </Box>
    );
};
