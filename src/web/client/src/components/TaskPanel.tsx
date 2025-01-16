import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../contexts/DataContext';
import { 
    Box, 
    Typography, 
    List, 
    ListItem, 
    ListItemText, 
    Checkbox
} from '@mui/material';
import { TaskDialog } from './TaskDialog';
import { TaskCard } from './TaskCard';

interface TaskPanelProps {
    channelId: string | null;
    threadId: string | null;
    selectedTask: any;
    setSelectedTask: (task: any) => void;
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ 
    channelId, 
    threadId,
    selectedTask,
    setSelectedTask,
    dialogOpen,
    setDialogOpen
}) => {
    const { tasks, fetchTasks, handles } = useWebSocket();
    const [localSelectedTask, setLocalSelectedTask] = useState<any>(null);
    const [localDialogOpen, setLocalDialogOpen] = useState(false);

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
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2, color: '#fff' }}>
                Tasks
            </Typography>
            <List>
                {Array.from(new Map((tasks || []).map(task => [task.id, task])).values())
                    .sort((a, b) => {
                        // Sort in-progress to top, then not started, then completed
                        if (a.inProgress && !b.inProgress) return -1;
                        if (!a.inProgress && b.inProgress) return 1;
                        if (a.complete && !b.complete) return 1;
                        if (!a.complete && b.complete) return -1;
                        return 0;
                    })
                    .map(task => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => {
                            setLocalSelectedTask(task);
                            setLocalDialogOpen(true);
                        }}
                        onCheckboxClick={(e) => {
                            e.stopPropagation();
                            setLocalSelectedTask(task);
                            setLocalDialogOpen(true);
                        }}
                    />
                ))}
            </List>

            <TaskDialog
                open={localDialogOpen}
                onClose={() => setLocalDialogOpen(false)}
                selectedTask={localSelectedTask}
                setSelectedTask={setLocalSelectedTask}
                tasks={tasks}
            />
        </Box>
    );
};
