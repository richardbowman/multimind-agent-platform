import React, { useState } from 'react';
import { Paper, Typography, List } from '@mui/material';
import { Task } from '../../../../tools/taskManager';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

interface InProgressTasksProps {
    tasks: Task[];
}

export const InProgressTasks: React.FC<InProgressTasksProps> = ({ tasks }) => {
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

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
            <List sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {tasks.map(task => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => {
                            setSelectedTask(task);
                            setDialogOpen(true);
                        }}
                        onCheckboxClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(task);
                            setDialogOpen(true);
                        }}
                    />
                ))}
            </List>

            {selectedTask && (
                <TaskDialog
                    open={dialogOpen}
                    onClose={() => {
                        setDialogOpen(false);
                        setSelectedTask(null);
                    }}
                    selectedTask={selectedTask}
                    setSelectedTask={setSelectedTask}
                    tasks={tasks}
                />
            )}
        </Paper>
    );
};
