import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Card, CardContent, Stack, Paper, Avatar } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTasks } from '../contexts/TaskContext';
import { useIPCService } from '../contexts/IPCContext';
import { useMessages } from '../contexts/MessageContext';
import { useChannels } from '../contexts/ChannelContext';
import { useFilteredTasks } from '../contexts/FilteredTaskContext';
import { TaskType } from '../../../../tools/taskManager';
import { TaskStatus } from '../../../../schemas/TaskStatus';
import { CustomScrollbarStyles } from '../styles/styles';
import { ScrollView } from './shared/ScrollView';

interface WelcomePanelProps {
    onStartTask: (taskId: string) => void;
    onSwitchToChat: () => void;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({ onStartTask, onSwitchToChat }) => {
    const { channels } = useChannels();
    const { sendMessage, currentChannelId, messages } = useMessages();
    const { filteredTasks : tasks } = useFilteredTasks();
    const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

    // Find the welcome message from the agent
    useEffect(() => {
        const welcomeMsg = messages.find(m => 
            m.channel_id === currentChannelId && 
            m.props?.messageType === 'welcome'
        );
        if (welcomeMsg) {
            setWelcomeMessage(welcomeMsg.message);
        }
    }, [messages, currentChannelId]);

    const channel = channels.find(c => c.id === currentChannelId);
    const goals = tasks.filter(t => t.type === TaskType.Goal);

    return (
        <ScrollView sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
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
                <Avatar sx={{ width: 80, height: 80, alignSelf: 'flex-start' }}>
                    {channel?.name?.[1]?.toUpperCase()}
                </Avatar>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Welcome to {channel?.name}
                    </Typography>
                    <Typography variant="subtitle1">
                        {channel?.description}
                    </Typography>
                    {welcomeMessage && (
                        <Paper elevation={0} sx={{ 
                            mt: 2, 
                            p: 2, 
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            maxHeight: 200,
                            overflowY: 'hidden'
                        }}>
                            <ScrollView>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {welcomeMessage}
                            </ReactMarkdown>
                            </ScrollView>
                        </Paper>
                    )}
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
                        opacity: task.status === TaskStatus.Completed || task.status === TaskStatus.Cancelled ? 0.7 : 1,
                        '&:hover': {
                            transform: task.status === TaskStatus.Pending ? 'translateY(-8px)' : 'none',
                            boxShadow: task.status === TaskStatus.Pending ? '0 8px 24px rgba(0,0,0,0.12)' : 'none'
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
                                        message: `The user has requested to initiate the following channel goal: ${task.description}`,
                                        user_id: 'system', // Or use actual user ID
                                        create_at: Date.now()
                                    });
                                }}
                                disabled={task.status !== TaskStatus.Pending}
                            >
                                {task.status === TaskStatus.InProgress && 'In Progress...'}
                                {task.status === TaskStatus.Pending && 'Start Goal'}
                                {task.status === TaskStatus.Completed && 'Completed'}
                                {task.status === TaskStatus.Cancelled && 'Cancelled'}
                            </Button>
                        </Box>
                    </Card>
                ))}
            </Box>
        </ScrollView>
    );
};
