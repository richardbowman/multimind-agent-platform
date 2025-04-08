import { useDropzone } from 'react-dropzone';
import React, { useState, useEffect } from 'react';
import { ModelInfo } from '../../../../llm/types';
import { Card, Typography, Alert, TextField, List, ListItem, ListItemText, Divider, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { Box } from '@mui/system';
import { useIPCService } from '../contexts/IPCContext';
import { ClientError } from '../../../../types/RPCInterface';
import { useSnackbar } from '../contexts/SnackbarContext';
import { LLMProvider } from '../../../../llm/types/LLMProvider';
import { ModelType } from '../../../../llm/types/ModelType';

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}
// import { webUtils } from 'electron';

interface ModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    provider: LLMProvider;
    modelType: ModelType;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, provider, modelType }) => {
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
        if (provider) {
            // Clear previous models and load new ones
            setModels([]);
            setSelectedModel(null);
            loadModels();
        }
    }, [provider]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: {
            'application/octet-stream': ['.gguf']
        },
        maxFiles: 1,
        onDrop: async (acceptedFiles) => {
            if (acceptedFiles.length > 0) {
                const file = acceptedFiles[0];
                setIsUploadingModel(true);
                setUploadError('');
                
                // Start upload in background
                const upload = async () => {
                    try {
                        const CHUNK_SIZE = 1024 * 1024 * 10; // 10MB chunks
                        let offset = 0;
                        let uploadId = '';
                        const totalSize = file.size;
                        
                        while (offset < totalSize) {
                            const chunk = file.slice(offset, offset + CHUNK_SIZE);
                            const arrayBuffer = await chunk.arrayBuffer();
                            const base64 = arrayBufferToBase64(arrayBuffer);
                            
                            const result = await ipcService.getRPC().uploadGGUFModelChunk({
                                chunk: base64,
                                fileName: file.name,
                                uploadId,
                                isLast: offset + CHUNK_SIZE >= totalSize
                            });
                            
                            uploadId = result.uploadId;
                            offset += CHUNK_SIZE;

                            // Update progress
                            const percentComplete = offset / totalSize;
                            snackbar.showSnackbar({
                                message: `Uploading ${file.name}...`,
                                severity: 'progress',
                                percentComplete,
                                persist: true
                            });
                        }

                        // Update the model list
                        const models = await ipcService.getRPC().getAvailableModels(LLMProvider.LLAMA_CPP, ModelType.CONVERSATION);
                        setModels(models);

                        handleSelect({ id: file.name });

                        snackbar.showSnackbar({ 
                            message: `Model ${file.name} uploaded successfully`,
                            severity: 'success'
                        });

                    } catch (error) {
                        console.error('Failed to upload model:', error);
                        snackbar.showSnackbar({
                            message: `Failed to upload model: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            severity: 'error'
                        });
                    } finally {
                        setIsUploadingModel(false);
                    }
                };

                // Start upload without waiting
                upload();
            }
        }
    });

    const loadModels = async (searchTerm = '') => {
        setLoading(true);
        setError(null);
        try {
            const result = await ipcService.getRPC().getAvailableModels(
                provider,
                modelType,
                searchTerm
            );
            if (result instanceof ClientError) throw result;
            
            // Sort models by provider and name
            const sortedModels = result.sort((a, b) => {
                if (a.provider === b.provider) {
                    return a.id.localeCompare(b.id);
                }
                return a.provider.localeCompare(b.provider);
            });
            
            setModels(sortedModels);
            
            // If we have a value, try to select the corresponding model
            if (value) {
                const selected = sortedModels.find(m => m.id === value);
                if (selected) {
                    setSelectedModel(selected);
                }
            }
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
        <Box sx={{ 
            mt: 2,
            width: '100%',
            maxWidth: 800,
            mx: 'auto',
            p: 2
        }}>
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

                <Box sx={{
                    maxHeight: 500,
                    overflowY: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1
                }}>
                    <List>
                        {models?.map((model) => (
                            <React.Fragment key={model.id}>
                                <ListItem
                                    onClick={() => handleSelect(model)}
                                    sx={{
                                        cursor: 'pointer',
                                        p: 1,
                                        transition: 'background-color 0.3s',
                                        '&:hover': {
                                            backgroundColor: 'action.hover'
                                        },
                                        ...(selectedModel?.id === model.id && {
                                            backgroundColor: 'primary.lighter'
                                        })
                                    }}
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
                    {uploadError && !isUploadingModel && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {uploadError}
                        </Alert>
                    )}
                </Box>

                {selectedModel && (
                    <Box sx={{ 
                        p: 2, 
                        mt: 2,
                        backgroundColor: 'background.default',
                        borderRadius: 1
                    }}>
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
