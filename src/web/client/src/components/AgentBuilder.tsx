import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    FormControl
} from '@mui/material';
import { Settings } from '../../../../tools/settings';
import { getClientSettingsMetadata } from '../../../../tools/settingsDecorators';

interface AgentBuilderProps {
    settings: Settings;
    onSettingsChange: (settings: Settings) => void;
    metadata: Array<{
        key: string;
        label: string;
        type: string;
        category: string;
        description?: string;
        options?: string[];
        defaultValue?: any;
        sensitive?: boolean;
        required?: boolean;
    }>;
    renderInput: (metadata: any) => JSX.Element;
}

export const AgentBuilder: React.FC<AgentBuilderProps> = ({
    settings,
    onSettingsChange,
    metadata,
    renderInput
}) => {
    return (
        <Paper
            sx={{
                p: 3,
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: 1,
                mb: 3
            }}
        >
            <Typography variant="h6" gutterBottom sx={{
                mb: 2,
                pb: 1,
                borderBottom: '1px solid',
                borderColor: 'divider'
            }}>
                Agent Builder
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(settings.agentBuilder || {}).map(([agentId, agentConfig]) => (
                    <Paper key={agentId} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            {agentConfig.name || `Agent ${agentId}`}
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {metadata.map(metadata => (
                                <FormControl key={`${agentId}.${metadata.key}`} fullWidth>
                                    {renderInput({
                                        ...metadata,
                                        key: `agentBuilder.${agentId}.${metadata.key}`
                                    })}
                                    {metadata.description && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                            {metadata.description}
                                        </Typography>
                                    )}
                                </FormControl>
                            ))}
                        </Box>
                    </Paper>
                ))}
                
                <Button 
                    variant="contained" 
                    onClick={() => {
                        const newAgentId = `agent-${Date.now()}`;
                        onSettingsChange({
                            ...settings,
                            agentBuilder: {
                                ...settings.agentBuilder,
                                [newAgentId]: {
                                    name: '',
                                    description: '',
                                    purpose: '',
                                    finalInstructions: '',
                                    plannerType: 'nextStep',
                                    autoRespondChannelIds: '',
                                    enabled: true
                                }
                            }
                        });
                    }}
                >
                    Add New Agent
                </Button>
            </Box>
        </Paper>
    );
};
