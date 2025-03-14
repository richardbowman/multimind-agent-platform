import React from 'react';
import {
    Box,
    Typography,
    Dialog,
    DialogTitle,
    DialogContent,
    Stack,
    Button
} from '@mui/material';
import { TaskDialog } from './TaskDialog';

interface ChatDetailsDialogProps {
    open: boolean;
    onClose: () => void;
    selectedMessage: any;
    tasks: any[];
    onTaskClick: (task: any) => void;
}

export const ChatDetailsDialog: React.FC<ChatDetailsDialogProps> = ({
    open,
    onClose,
    selectedMessage,
    tasks,
    onTaskClick
}) => {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>Message Metadata</DialogTitle>
            <DialogContent>
                {selectedMessage && (
                    <Stack spacing={2} sx={{ mt: 2 }}>
                        <Box sx={{
                            p: 1,
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            mb: 1
                        }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                Message Content
                            </Typography>
                            <Typography variant="body2" sx={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {selectedMessage.message}
                            </Typography>
                        </Box>
                        <Typography variant="body1">
                            <strong>ID:</strong> {selectedMessage.id}
                        </Typography>
                        <Typography variant="body1">
                            <strong>Channel ID:</strong> {selectedMessage.channel_id}
                        </Typography>
                        <Typography variant="body1">
                            <strong>Thread ID:</strong> {selectedMessage.thread_id || 'None'}
                        </Typography>
                        <Typography variant="body1">
                            <strong>Created At:</strong> {new Date(selectedMessage.create_at).toLocaleString()}
                        </Typography>
                        <Typography variant="body1">
                            <strong>User ID:</strong> {selectedMessage.user_id}
                        </Typography>
                        {selectedMessage.props && Object.entries(selectedMessage.props).map(([key, value]) => {
                            const isProjectIds = key === 'project-ids';
                            return (
                                <Box key={key} sx={{
                                    p: 1,
                                    bgcolor: 'background.paper',
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: 1
                                }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                        {key}
                                    </Typography>
                                    {isProjectIds ? (
                                        <Button
                                            variant="text"
                                            sx={{
                                                p: 0,
                                                textTransform: 'none',
                                                justifyContent: 'flex-start',
                                                '&:hover': {
                                                    textDecoration: 'underline'
                                                }
                                            }}
                                            onClick={() => {
                                                // Ensure value is treated as string since project IDs are strings
                                                const projectId = String(value);
                                                
                                                // Find tasks that match this project ID
                                                const projectTasks = tasks.filter(t => 
                                                    Array.isArray(t.props?.["project-ids"]) && 
                                                    t.props["project-ids"].includes(projectId)
                                                );
                                                
                                                if (projectTasks.length > 0) {
                                                    // Pass all matching tasks to the task dialog
                                                    onTaskClick({
                                                        ...projectTasks[0],
                                                        relatedTasks: projectTasks
                                                    });
                                                } else {
                                                    // If no tasks found, create a new task for this project
                                                    onTaskClick({
                                                        projectId: projectId,
                                                        description: `New task for project ${projectId}`,
                                                        type: 'standard',
                                                        complete: false,
                                                        inProgress: false,
                                                        createdAt: new Date().toISOString(),
                                                        updatedAt: new Date().toISOString(),
                                                        props: {
                                                            "project-ids": [projectId]
                                                        }
                                                    });
                                                }
                                            }}
                                        >
                                            <Typography variant="body2" sx={{
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word'
                                            }}>
                                                {value}
                                            </Typography>
                                        </Button>
                                    ) : (
                                        <Typography variant="body2" sx={{
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word'
                                        }}>
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                        </Typography>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </DialogContent>
        </Dialog>
    );
};
