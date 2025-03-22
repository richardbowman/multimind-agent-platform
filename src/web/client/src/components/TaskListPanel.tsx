import React from 'react';
import { 
    Box,
    Typography,
    List
} from '@mui/material';
import { ScrollView } from './shared/ScrollView';
import { TaskCard } from './TaskCard';

interface TaskListPanelProps {
    projectTasks: any[];
    selectedTask: any;
    onSelectTask: (task: any) => void;
}

export const TaskListPanel: React.FC<TaskListPanelProps> = ({ 
    projectTasks,
    selectedTask,
    onSelectTask
}) => {
    return (
        <Box sx={{ 
            width: '30%',
            height: '70vh',
            p: 1,
            borderRight: '1px solid',
            borderColor: 'divider'
        }}>
            <ScrollView>
                <Typography 
                    variant="h6" 
                    sx={{ 
                        mb: 1, 
                        position: 'sticky', 
                        top: 0, 
                        bgcolor: 'background.default', 
                        color: 'text.primary'
                    }}
                >
                    Project Tasks
                </Typography>
                <List>
                    {projectTasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            selected={task.id === selectedTask?.id}
                            onClick={() => onSelectTask(task)}
                        />
                    ))}
                </List>
            </ScrollView>
        </Box>
    );
};
