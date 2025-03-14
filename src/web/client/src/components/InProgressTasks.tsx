import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { Spinner } from './Spinner';
import { Task } from '../../../../tools/taskManager';

interface InProgressTasksProps {
    tasks: Task[];
}

export const InProgressTasks: React.FC<InProgressTasksProps> = ({ tasks }) => {
    if (!tasks || tasks.length === 0) return null;

    return (
        <Paper
            elevation={0}
            sx={{
                mt: 2,
                p: 2,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2
            }}
        >
            <Typography
                variant="overline"
                sx={{
                    mb: 1,
                    color: 'text.secondary',
                    display: 'block'
                }}
            >
                In Progress Tasks
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {tasks.map(task => (
                    <Paper
                        key={task.id}
                        elevation={0}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 1,
                            bgcolor: 'background.default',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}
                    >
                        <Spinner />
                        <Typography variant="body2" sx={{ color: 'text.primary' }}>
                            {task.description}
                        </Typography>
                    </Paper>
                ))}
            </Box>
        </Paper>
    );
};
