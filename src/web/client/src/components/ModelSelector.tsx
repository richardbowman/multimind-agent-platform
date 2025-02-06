import { useDropzone } from 'react-dropzone';
import React, { useState, useEffect } from 'react';
import { ModelInfo } from '../../../../llm/types';
import { Card, Typography, Alert, TextField, List, ListItem, ListItemText, Divider, Dialog, DialogTitle, DialogContent, Button, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { Box } from '@mui/system';
import './ModelSelector.css';
import { useIPCService } from '../contexts/IPCContext';
import { useDataContext } from '../contexts/DataContext';
import { ClientError } from '../../../../shared/RPCInterface';
import { useSnackbar } from '../contexts/SnackbarContext';
import { BrowserElectron } from '../../../../browserExport';
// import { webUtils } from 'electron';

interface ModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    provider: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, provider }) => {
    const snackbar = useSnackbar();
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
    const ipcService = useIPCService();
    const [modelFetchError, setModelFetchError] = useState<string>('');
    const [isUploadingModel, setIsUploadingModel] = useState(false);
    const [uploadError, setUploadError] = useState<string>('');

    useEffect(() => {
        loadModels();
    }, [provider]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: {
            'application/octet-stream': ['.gguf']
        },
        maxFiles: 1,
        onDrop: async (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                const file = acceptedFiles[0];
                try {
                    setIsUploadingModel(true);
                    setUploadError('');
                    const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
                    let offset = 0;
                    let uploadId = '';
                    
                    while (offset < file.size) {
                        const chunk = file.slice(offset, offset + CHUNK_SIZE);
                        const arrayBuffer = await chunk.arrayBuffer();
                        
                        const result = await ipcService.getRPC().uploadGGUFModelChunk({
                            chunk: arrayBuffer,
                            fileName: file.name,
                            uploadId,
                            isLast: offset + CHUNK_SIZE >= file.size
                        });
                        
                        uploadId = result.uploadId;
                        offset += CHUNK_SIZE;
                    }

                    // Update the model list
                    const models = await ipcService.getRPC().getAvailableModels('llama_cpp');
                    setModels(models);

                    handleSelect({ id: file.name });

                    snackbar.showSnackbar({ message: `Model ${file.name} uploaded successfully` });

                } catch (error) {
                    console.error('Failed to upload model:', error);
                    setUploadError(`Failed to upload model: ${error instanceof Error ? error.message : 'Unknown error'}`);
                } finally {
                    setIsUploadingModel(false);
                }
            }
        }
    });

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
        <Box className="model-selector" sx={{ mt: 2 }}>
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

                {modelFetchError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {modelFetchError}
                    </Alert>
                )}

                <Box className="model-list-container">
                    <List>
                        {models.map((model) => (
                            <React.Fragment key={model.id}>
                                <ListItem
                                    onClick={() => handleSelect(model)}
                                    className={`model-item ${selectedModel?.id === model.id ? 'selected' : ''}`}
                                >
                                    <Card component="li" sx={{ width: '100%', p: 2 }}>
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

                <Box
                    {...getRootProps()}
                    sx={{
                        border: '2px dashed',
                        borderColor: isDragActive ? 'primary.main' : 'divider',
                        borderRadius: 2,
                        p: 3,
                        textAlign: 'center',
                        cursor: 'pointer',
                        backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
                        '&:hover': {
                            backgroundColor: 'action.hover'
                        }
                    }}
                >
                    <input {...getInputProps()} />
                    {isUploadingModel ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={24} />
                            <Typography>Uploading model...</Typography>
                        </Box>
                    ) : (
                        <>
                            <Typography>Drag & drop a GGUF model file here, or click to select</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Supported formats: .gguf
                            </Typography>
                        </>
                    )}
                    {uploadError && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {uploadError}
                        </Alert>
                    )}
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
