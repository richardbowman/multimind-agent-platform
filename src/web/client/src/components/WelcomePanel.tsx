import React from 'react';
import { Box, Typography, Button, Card, CardContent, Stack, Paper } from '@mui/material';
import { useDataContext } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';

interface WelcomePanelProps {
    onStartTask: (taskId: string) => void;
    onSwitchToChat: () => void;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({ onStartTask, onSwitchToChat }) => {
    const { currentChannelId, channels, tasks, sendMessage } = useDataContext();
    const ipcService = useIPCService();

    const channel = channels.find(c => c.id === currentChannelId);
    const projectTasks = tasks.filter(t => t.projectId === channel?.projectId);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 64px)',
            width: '100%',
            overflow: 'hidden',
            p: 4
        }}>
            <Paper elevation={0} sx={{ 
                mb: 4, 
                p: 3,
                bgcolor: 'background.paper',
                borderRadius: 2
            }}>
                <Typography variant="h4" gutterBottom>
                    Welcome to {channel?.name}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                    Let's get started by choosing a task to work on:
                </Typography>
                
                <Button 
                    variant="contained" 
                    onClick={onSwitchToChat}
                    sx={{ mb: 2 }}
                >
                    Go to Chat
                </Button>
            </Paper>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 3
            }}>
                {projectTasks.map(task => (
                    <Card key={task.id} sx={{ 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s',
                        '&:hover': {
                            transform: 'translateY(-4px)'
                        }
                    }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                            <Typography variant="h6" gutterBottom>
                                {task.description}
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                {task.metadata?.details || 'No additional details'}
                            </Typography>
                        </CardContent>
                        <Box sx={{ p: 2 }}>
                            <Button 
                                variant="contained" 
                                fullWidth
                                onClick={() => {
                                    onStartTask(task.id);
                                    sendMessage({
                                        channel_id: currentChannelId,
                                        message: `I'd like to get started on task: ${task.description}`,
                                        user_id: 'system', // Or use actual user ID
                                        create_at: Date.now()
                                    });
                                }}
                                disabled={task.inProgress}
                            >
                                {task.inProgress ? 'In Progress...' : 'Start Task'}
                            </Button>
                        </Box>
                    </Card>
                ))}
            </Box>
        </Box>
    );
};
