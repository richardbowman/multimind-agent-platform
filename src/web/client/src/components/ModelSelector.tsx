import React, { useState, useEffect } from 'react';
import { ModelInfo } from '../../../../llm/types';
import { Card, Typography, Alert, TextField, List, ListItem, ListItemText, Divider } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { Box } from '@mui/system';
import './ModelSelector.css';
import { useIPCService } from '../contexts/IPCContext';
import { ClientError } from '../../../../shared/RPCInterface';

interface ModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    provider: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, provider }) => {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
    const ipcService = useIPCService();

    useEffect(() => {
        loadModels();
    }, [provider]);

    const loadModels = async (searchTerm = '') => {
        setLoading(true);
        setError(null);
        try {
            const result = await ipcService.getRPC().getAvailableModels(
                provider,
                searchTerm 
            );
            if (result instanceof ClientError) throw result;
            setModels(result);
        } catch (err) {
            setError('Failed to load models');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearch(value);
        loadModels(value);
    };

    const handleSelect = (model: ModelInfo) => {
        setSelectedModel(model);
        if (onChange) {
            onChange(model.id);
        }
    };

    return (
        <Box className="model-selector">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                <TextField
                    placeholder="Search models..."
                    value={search}
                    onChange={handleSearch}
                    InputProps={{
                        startAdornment: <SearchIcon />
                    }}
                    fullWidth
                />

                {error && <Alert severity="error">{error}</Alert>}

                <Box className="model-list-container">
                    <List>
                        {models.map((model) => (
                            <React.Fragment key={model.id}>
                                <ListItem 
                                    onClick={() => handleSelect(model)}
                                    className={`model-item ${selectedModel?.id === model.id ? 'selected' : ''}`}
                                >
                                    <Card sx={{ width: '100%', p: 2 }}>
                                        <ListItemText
                                            primary={
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {model.id}
                                                </Typography>
                                            }
                                            secondary={
                                                <>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {model.provider}
                                                    </Typography>
                                                    <Typography variant="body2">
                                                        {model.description}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Context: {model.contextSize} tokens | 
                                                        Max Tokens: {model.maxTokens}
                                                    </Typography>
                                                </>
                                            }
                                        />
                                    </Card>
                                </ListItem>
                                <Divider component="li" />
                            </React.Fragment>
                        ))}
                    </List>
                </Box>

                {selectedModel && (
                    <Box className="selected-model" sx={{ p: 2, mt: 2 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                            Selected Model:
                        </Typography>
                        <Typography variant="body1">
                            {selectedModel.id}
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ModelSelector;
