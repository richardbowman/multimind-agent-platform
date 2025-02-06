import React from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemButton,
    Button
} from '@mui/material';
import { ClientProject } from '../../../../shared/types';
import { UUID } from '../../../../types/uuid';

interface ChatHeaderProps {
    currentProject: ClientProject | null;
    channels: any[];
    tasks: any[];
    currentChannelId: UUID;
    handles: any[];
    onTaskClick: (task: any) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
    currentProject,
    channels,
    tasks: goals,
    currentChannelId,
    handles,
    onTaskClick
}) => {
    const channel = channels.find(c => c.id === currentChannelId);
    const goalTemplate = channel?.goalTemplate;
    const projectId = channel?.projectId;
    const planningTasks = goals.filter(t => t.projectId === projectId && t.type === 'planning');

    return (
        <>
            {/* Project Overview Card */}
            {currentProject && (
                <Paper
                    elevation={0}
                    sx={{
                        mb: 2,
                        p: 2,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2
                    }}
                >
                    <Typography variant="overline" sx={{ mb: 1, color: 'text.secondary', display: 'block' }}>
                        Channel Overview
                    </Typography>
                    <Box>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                            {currentProject.name}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            {currentProject.metadata.description}
                        </Typography>

                        {goals?.length > 0 && (<Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Goals:
                            </Typography>
                            <List dense sx={{ mb: 2 }}>
                                {currentProject.tasks.map(task => (
                                    <ListItem key={task.id} sx={{ p: 0 }}>
                                        <ListItemButton onClick={() => onTaskClick(task)}>
                                            <Typography variant="body2">
                                                {task.description}
                                            </Typography>
                                            {task.complete && (
                                                <Typography variant="caption" sx={{ ml: 1, color: 'success.main' }}>
                                                    ✓
                                                </Typography>
                                            )}
                                            {task.inProgress && (
                                                <Typography variant="caption" sx={{ ml: 1, color: 'warning.main' }}>
                                                    ⌛
                                                </Typography>
                                            )}
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>)}

                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Status: {currentProject.metadata.status} |
                            Created: {new Date(currentProject.metadata.createdAt).toLocaleDateString()} |
                            Last Updated: {new Date(currentProject.metadata.updatedAt).toLocaleDateString()}
                        </Typography>
                    </Box>
                </Paper>
            )}

            {/* Goal Planning Card */}
            {!currentProject && goalTemplate && (
                <Paper
                    elevation={0}
                    sx={{
                        mb: 2,
                        p: 2,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2
                    }}
                >
                    <Typography variant="overline" sx={{ mb: 1, color: 'text.secondary', display: 'block' }}>
                        Project Planning
                    </Typography>
                    <Box>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                            {goalTemplate.name}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            {goalTemplate.description}
                        </Typography>

                        {planningTasks.length > 0 ? (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Planning Tasks:
                                </Typography>
                                <List dense sx={{ mb: 2 }}>
                                    {planningTasks.map(task => (
                                        <ListItem key={task.id} sx={{ p: 0 }}>
                                            <ListItemButton onClick={() => onTaskClick(task)}>
                                                <Typography variant="body2">
                                                    {task.description}
                                                </Typography>
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        ) : (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                No planning tasks created yet
                            </Typography>
                        )}

                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Supporting Agents: {goalTemplate.supportingAgents
                                .map(id => handles.find(h => h.id === id)?.handle || 'Unknown')
                                .join(', ')}
                        </Typography>
                    </Box>
                </Paper>
            )}
        </>
    );
};
