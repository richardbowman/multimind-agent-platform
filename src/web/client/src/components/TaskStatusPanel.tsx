import React, { useMemo, useEffect, useState } from 'react';
import { 
    Box, 
    Typography,
    ListItem,
    Paper,
    keyframes,
    AppBar,
    Toolbar,
    IconButton,
    Grid2 as Grid
} from '@mui/material';
import { ScrollView } from './shared/ScrollView';
import CloseIcon from '@mui/icons-material/Close';
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
        [TaskStatus.Pending]: 'warning.50',
        [TaskStatus.InProgress]: 'info.50',
        [TaskStatus.Completed]: 'success.50',
        [TaskStatus.Cancelled]: 'error.50'
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
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0
        }}>
            <AppBar 
                position="static" 
                elevation={0} 
                sx={{ 
                    mb: 2,
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                    color: 'text.primary'
                }}
            >
                <Toolbar variant="dense" sx={{ minHeight: 48 }}>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Task Board
                    </Typography>
                    <IconButton
                        edge="end"
                        color="inherit"
                        aria-label="close"
                        onClick={() => {/* Add close handler here */}}
                        size="small"
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Toolbar>
            </AppBar>
            
            <Box 
                sx={{
                    flexDirection: 'row',
                    display: 'flex',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                {Object.entries(groupedTasks).map(([status, tasks]) => (
                    <Box 
                        sx={{
                            display: 'flex',
                            overflow: 'hidden',
                            height: '100%',
                            minWidth: 250
                        }}
                    >
                        <Paper 
                            sx={{ 
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                p: 2,
                                m: 1,
                                bgcolor: statusColors[status as TaskStatus],
                                borderRadius: 2
                            }}
                        >
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {statusLabels[status as TaskStatus]} ({tasks.length})
                        </Typography>
                        
                        <ScrollView>
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
                        </ScrollView>
                        </Paper>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
