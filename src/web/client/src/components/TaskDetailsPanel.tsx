import React from 'react';
import {
    Box,
    Typography,
    Stack,
    Button
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { ScrollView } from './shared/ScrollView';
import { AttachmentCard } from './shared/AttachmentCard';

interface TaskDetailsPanelProps {
    selectedTask: any;
    projectDetails: any;
    artifacts: any[];
    handles: any[];
    onViewParentTask: (taskId: string) => void;
    onViewChildTask: (taskId: string) => void;
}

export const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({ 
    selectedTask,
    projectDetails,
    artifacts,
    handles,
    onViewParentTask,
    onViewChildTask
}) => {
    if (!selectedTask) return null;

    return (
        <Box sx={{ 
            width: '70%',
            height: '70vh',
            pl: 2
        }}>
            <ScrollView>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {(selectedTask.projectId || selectedTask.props?.childProjectId) && (
                        <Box sx={{ 
                            p: 2,
                            mb: 1,
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Box sx={{ 
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                gap: 2
                            }}>
                                {projectDetails?.metadata?.parentTaskId && (
                                    <Box sx={{ 
                                        p: 2,
                                        bgcolor: 'background.default',
                                        borderRadius: 1
                                    }}>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            fullWidth
                                            startIcon={<ArrowUpwardIcon />}
                                            onClick={() => onViewParentTask(projectDetails.metadata.parentTaskId)}
                                        >
                                            Parent Project
                                        </Button>
                                    </Box>
                                )}
                                {selectedTask.props?.childProjectId && (
                                    <Box sx={{ 
                                        p: 2,
                                        bgcolor: 'background.default',
                                        borderRadius: 1
                                    }}>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            fullWidth
                                            startIcon={<ArrowDownwardIcon />}
                                            onClick={() => onViewChildTask(selectedTask.props.childProjectId)}
                                        >
                                            Child Project
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )}
                    
                    {projectDetails && (
                        <Box sx={{ 
                            p: 2,
                            mb: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                Project: {projectDetails.name}
                            </Typography>
                            {projectDetails.description && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {projectDetails.description}
                                </Typography>
                            )}
                            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                                Project ID: {projectDetails.id}
                            </Typography>
                            {projectDetails.metadata?.status && (
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                    Status: {projectDetails.metadata.status}
                                </Typography>
                            )}
                            {projectDetails.metadata?.priority && (
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                    Priority: {projectDetails.metadata.priority}
                                </Typography>
                            )}
                        </Box>
                    )}
                    
                    <Typography variant="body1">
                        <strong>Description:</strong> {selectedTask.description}
                    </Typography>
                    <Typography variant="body1">
                        <strong>Status:</strong> {selectedTask.status === 'cancelled' ? 'Cancelled' : 
                            selectedTask.status === 'completed' ? 'Complete' : 
                            selectedTask.status === 'inProgress' ? 'In Progress' : 
                            'Not Started'}
                    </Typography>
                    <Typography variant="body1">
                        <strong>Created At:</strong> {new Date(selectedTask.props?.createdAt).toLocaleString()}
                    </Typography>
                    <Typography variant="body1">
                        <strong>Last Updated:</strong> {new Date(selectedTask.props?.updatedAt).toLocaleString()}
                    </Typography>
                    {selectedTask.props?.dueDate && (
                        <Typography variant="body1">
                            <strong>Due Date:</strong> {new Date(selectedTask.props?.dueDate).toLocaleString()}
                        </Typography>
                    )}
                    <Typography variant="body1">
                        <strong>Type:</strong> {selectedTask.type}
                        {selectedTask.props?.stepType && ` (${selectedTask.props?.stepType})`}
                    </Typography>
                    <Typography variant="body1">
                        <strong>Assignee:</strong> {selectedTask.assignee ? (handles.find(h => h.id === selectedTask.assignee)?.handle) || selectedTask.assignee : 'Unassigned'}
                    </Typography>
                    {selectedTask.dependsOn && (
                        <Typography variant="body1">
                            <strong>Depends On:</strong> {selectedTask.dependsOn}
                        </Typography>
                    )}
                    
                    {(selectedTask.props?.attachedArtifactIds?.length > 0 || 
                      selectedTask.props?.artifactIds?.length > 0 ||
                      selectedTask.props?.result?.artifactIds?.length > 0) && (
                        <Box sx={{ 
                            p: 2,
                            mb: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                Attached Artifacts
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {[
                                  ...(selectedTask.props?.attachedArtifactIds || []),
                                  ...(selectedTask.props?.artifactIds || []),
                                  ...(selectedTask.props?.result?.artifactIds || [])
                                ].filter((id): id is string => !!id).map((artifactId: string) => {
                                    const artifact = artifacts.find(a => a.id === artifactId);
                                    return (
                                        <AttachmentCard
                                            key={artifactId}
                                            type="artifact"
                                            title={artifact?.metadata?.title || `Artifact ${artifactId.slice(0, 6)}`}
                                            subtitle={artifact?.type}
                                            onRemove={() => {
                                                // TODO: Implement artifact removal
                                                console.log('Remove artifact', artifactId);
                                            }}
                                            onClick={() => {
                                                // TODO: Implement artifact viewing
                                                console.log('View artifact', artifactId);
                                            }}
                                        />
                                    );
                                })}
                            </Box>
                        </Box>
                    )}
                    
                    {selectedTask.props && Object.entries(selectedTask.props).map(([key, value]) => (
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
                            <Typography variant="body2" sx={{ 
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            </ScrollView>
        </Box>
    );
};
