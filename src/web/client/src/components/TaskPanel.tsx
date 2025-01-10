import React, { useEffect } from 'react';
import { TaskStatus } from '../../../../schemas/reviewProgress';
import { useWebSocket } from '../contexts/DataContext';
import { Box, Typography, List, ListItem, ListItemText, Chip } from '@mui/material';

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

    const getStatusColor = (task: any) => {
        if (task.complete) return 'success';
        if (task.inProgress) return 'primary';
        return 'default';
    };

    return (
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2, color: '#fff' }}>
                Tasks
            </Typography>
            <List>
                {(tasks || []).map(task => (
                    <ListItem 
                        key={task.id}
                        sx={{
                            mb: 1,
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}
                    >
                        <Chip
                            label={task.complete ? 'Complete' : (task.inProgress ? 'In Progress' : 'Not Started')}
                            color={getStatusColor(task)}
                            size="small"
                            sx={{ mr: 2 }}
                        />
                        <ListItemText
                            primary={task.description}
                            primaryTypographyProps={{ color: '#fff' }}
                        />
                    </ListItem>
                ))}
            </List>
        </Box>
    );
};
