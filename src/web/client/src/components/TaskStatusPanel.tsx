import React, { useMemo, useEffect, useState } from 'react';
import { 
    Box, 
    Typography,
    List,
    ListItem,
    Paper,
    Grid,
    keyframes
} from '@mui/material';
import { useTasks } from '../contexts/TaskContext';
import { TaskCard } from './TaskCard';
import { TaskStatus } from '../../../../schemas/TaskStatus';

const fadeIn = keyframes`
  0% {
    opacity: 0;
    background-color: rgba(255, 255, 255, 0.3);
  }
  50% {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.6);
  }
  100% {
    background-color: transparent;
  }
`;

export const TaskStatusPanel: React.FC = () => {
    const { tasks } = useTasks();
    const [prevTaskIds, setPrevTaskIds] = useState<Set<string>>(new Set());
    
    // Track new tasks for animation
    useEffect(() => {
        const currentIds = new Set(tasks.map(t => t.id));
        setPrevTaskIds(currentIds);
    }, [tasks]);

    const isNewTask = (taskId: string) => !prevTaskIds.has(taskId);

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
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0
        }}>
            <Typography variant="h4" sx={{ mb: 3 }}>
                Task Board
            </Typography>
            
            <Grid 
                container 
                spacing={2}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    alignContent: 'flex-start'
                }}
            >
                {Object.entries(groupedTasks).map(([status, tasks]) => (
                    <Grid 
                        item 
                        key={status}
                        xs={12}
                        sm={6}
                        md={3}
                        sx={{
                            height: '100%',
                            minWidth: 250
                        }}
                    >
                        <Paper 
                            sx={{ 
                                height: '100%',
                                p: 2,
                                bgcolor: statusColors[status as TaskStatus],
                                borderRadius: 2
                            }}
                        >
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {statusLabels[status as TaskStatus]} ({tasks.length})
                        </Typography>
                        
                        <List sx={{ 
                            flex: 1,
                            minHeight: 0,
                            height: '100%',
                            overflowY: 'auto',
                            '& > *:not(:last-child)': {
                                mb: 1
                            },
                            pr: 1, // Add some padding for scrollbar
                            '&::-webkit-scrollbar': {
                                width: '6px'
                            },
                            '&::-webkit-scrollbar-thumb': {
                                backgroundColor: 'rgba(0,0,0,0.2)',
                                borderRadius: '3px'
                            }
                        }}>
                            {tasks.map(task => (
                                <ListItem 
                                    key={task.id} 
                                    sx={{ 
                                        p: 0,
                                        animation: isNewTask(task.id) ? 
                                            `${fadeIn} 1s ease-in-out` : 
                                            'none'
                                    }}
                                >
                                    <TaskCard 
                                        task={task}
                                        onClick={() => {}}
                                        onCheckboxClick={() => {}}
                                    />
                                </ListItem>
                            ))}
                        </List>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};
