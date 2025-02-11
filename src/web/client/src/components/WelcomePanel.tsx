import React from 'react';
import { Box, Typography, Button, Card, CardContent, Stack, Paper, Avatar } from '@mui/material';
import { useTasks } from '../contexts/TaskContext';
import { useIPCService } from '../contexts/IPCContext';
import { useMessages } from '../contexts/MessageContext';
import { useChannels } from '../contexts/ChannelContext';
import { useFilteredTasks } from '../contexts/FilteredTaskContext';
import { TaskType } from '../../../../tools/taskManager';

interface WelcomePanelProps {
    onStartTask: (taskId: string) => void;
    onSwitchToChat: () => void;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({ onStartTask, onSwitchToChat }) => {
    const { channels } = useChannels();
    const { sendMessage, currentChannelId } = useMessages();
    const { filteredTasks : tasks } = useFilteredTasks();
    const ipcService = useIPCService();

    const channel = channels.find(c => c.id === currentChannelId);
    const goals = tasks.filter(t => t.type === TaskType.Goal);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 64px)',
            width: '100%',
            overflow: 'hidden',
            p: 4
        }}>
            <Box sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 2,
                p: 4,
                mb: 4,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 3
            }}>
                <Avatar sx={{ width: 80, height: 80 }}>
                    {channel?.name?.[1]?.toUpperCase()}
                </Avatar>
                <Box>
                    <Typography variant="h3" gutterBottom>
                        Welcome to {channel?.name}
                    </Typography>
                    <Typography variant="subtitle1">
                        {channel?.description}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 3
            }}>
                {goals.map(task => (
                    <Card key={task.id} sx={{ 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                            transform: 'translateY(-8px)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
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

            {/* <Box sx={{
                mt: 4,
                p: 3,
                bgcolor: 'background.paper',
                borderRadius: 2,
                textAlign: 'center'
            }}>
                <Typography variant="h6" sx={{ fontStyle: 'italic' }}>
                    "The way to get started is to quit talking and begin doing."
                </Typography>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                    - Walt Disney
                </Typography>
            </Box> */}
        </Box>
    );
};
