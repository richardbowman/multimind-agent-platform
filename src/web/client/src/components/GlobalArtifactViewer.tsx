import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact, ArtifactType } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import { Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails, List, Drawer, Toolbar, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper } from '@mui/material';
import { ArtifactEditor } from './ArtifactEditor';
import { ArtifactCard } from './ArtifactCard';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import Checkbox from '@mui/material/Checkbox';
import { ActionToolbar } from './shared/ActionToolbar';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { useIPCService } from '../contexts/IPCContext';

export interface DrawerPage {
    drawerOpen: boolean;
    onDrawerToggle: () => void;
}

export const GlobalArtifactViewer: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const { allArtifacts, fetchAllArtifacts, deleteArtifact, showFileDialog } = useDataContext();
    const [selectedArtifacts, setSelectedArtifacts] = useState<Artifact[]>([]);
    const [artifactFolders, setArtifactFolders] = useState<Record<string, Artifact[]>>({});
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const ipcService = useIPCService();

    const baseToolbarActions = useMemo(() => [
        {
            icon: <AttachFileIcon />,
            label: 'Upload File',
            onClick: async () => {
                showFileDialog();
            }
        },
        {
            icon: <DescriptionIcon />,
            label: 'Create New Artifact',
            onClick: () => setEditorOpen(true)
        },
        {
            icon: <DeleteIcon />,
            label: `Delete Selected (${selectedArtifacts.length})`,
            onClick: () => setDeleteConfirmOpen(true),
            disabled: selectedArtifacts.length === 0,
            color: 'error',
            variant: 'outlined'
        }
    ], [showFileDialog, selectedArtifacts.length]);

    const { actions: toolbarActions, registerActions, unregisterActions } = useToolbarActions();

    useEffect(() => {
        registerActions('global-artifact-viewer', baseToolbarActions);
        return () => unregisterActions('global-artifact-viewer');
    }, [registerActions, unregisterActions]);

    const handleCreateArtifact = async (artifact: Artifact) => {
        // Update the selected artifact
        setSelectedArtifact(artifact);
        
        // Update the artifact in the folders list
        setArtifactFolders(prevFolders => {
            const updatedFolders = { ...prevFolders };
            
            // Check if this is an existing artifact
            const existing = Object.values(updatedFolders)
                .flat()
                .find(a => a.id === artifact.id);
                
            if (existing) {
                // Update existing artifact
                for (const [type, artifacts] of Object.entries(updatedFolders)) {
                    const index = artifacts.findIndex(a => a.id === artifact.id);
                    if (index !== -1) {
                        updatedFolders[type][index] = artifact;
                        break;
                    }
                }
            } else {
                // Add new artifact
                if (!updatedFolders[artifact.type]) {
                    updatedFolders[artifact.type] = [];
                }
                updatedFolders[artifact.type].push(artifact);
            }
            
            return updatedFolders;
        });
        
        // Refresh from server
        fetchAllArtifacts();
    };

    const handleDelete = async () => {
        if (selectedArtifacts.length > 0) {
            await Promise.all(selectedArtifacts.map(artifact => deleteArtifact(artifact.id)));
            setSelectedArtifacts([]);
            fetchAllArtifacts();
            setDeleteConfirmOpen(false);
        }
    };

    useEffect(() => {
        fetchAllArtifacts();
    }, []);

    useEffect(() => {
        if (allArtifacts) {
            const folders = allArtifacts.reduce((acc, artifact) => {
                const type = artifact.type;
                if (!acc[type]) acc[type] = [];
                acc[type].push(artifact);
                return acc;
            }, {} as Record<string, Artifact[]>);
            setArtifactFolders(folders);
        }
    }, [allArtifacts]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const content = e.target?.result;
                if (content) {
                    const artifact = await ipcService.getRPC().saveArtifact({
                        content: content,
                        metadata: {
                            title: file.name,
                            fileName: file.name,
                            mimeType: file.type,
                            size: file.size,
                            lastModified: file.lastModified
                        }
                    })

                    await handleCreateArtifact(artifact);
                }
            };
            
            reader.readAsText(file);
        }
    }, [handleCreateArtifact]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        noClick: true,
        noKeyboard: true
    });

    return (
        <Box 
            sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}
            {...getRootProps()}
        >
            <input {...getInputProps()} />
            {isDragActive && (
                <Paper
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        border: '2px dashed #fff',
                        pointerEvents: 'none'
                    }}
                >
                    <Typography variant="h4" color="white">
                        Drop files to upload
                    </Typography>
                </Paper>
            )}
            <Drawer
                variant="persistent"
                anchor="left"
                open={drawerOpen}
                sx={{
                    width: 250,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 250,
                        boxSizing: 'border-box',
                        backgroundColor: '#2a2a2a',
                        borderRight: '1px solid #444'
                    },
                }}
            >
                <Toolbar /> {/* For spacing under app bar */}
                {Object.entries(artifactFolders).map(([type, artifacts]) => (
                    <Accordion key={type}>
                        <AccordionSummary>
                            <FolderIcon sx={{ mr: 1 }} />
                            <Typography>{type} ({artifacts.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <List>
                                {artifacts.map(artifact => (
                                    <Box key={artifact.id} sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Checkbox
                                            checked={selectedArtifacts.some(a => a.id === artifact.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedArtifacts(prev => [...prev, artifact]);
                                                } else {
                                                    setSelectedArtifacts(prev => prev.filter(a => a.id !== artifact.id));
                                                }
                                            }}
                                        />
                                        <ArtifactCard
                                            artifact={artifact}
                                            selected={selectedArtifacts.some(a => a.id === artifact.id)}
                                            onClick={() => {
                                                setSelectedArtifacts(prev => 
                                                    prev.some(a => a.id === artifact.id)
                                                        ? prev.filter(a => a.id !== artifact.id)
                                                        : [...prev, artifact]
                                                );
                                            }}
                                            onEdit={() => {
                                                setEditorOpen(true);
                                                setSelectedArtifacts([artifact]);
                                            }}
                                        />
                                    </Box>
                                ))}
                            </List>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Drawer>
            <Box component="main" sx={{ 
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: drawerOpen ? 0 : '-250px', 
                transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                flex: 1,
                overflow: 'hidden',
                position: 'relative'
            }}>
                <ActionToolbar actions={toolbarActions} />
                {selectedArtifacts.length === 1 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', pt: 1 }}>
                            <ArtifactDisplay 
                                artifact={selectedArtifacts[0]} 
                                showMetadata={true}
                                onDelete={() => setDeleteConfirmOpen(true)}
                                onEdit={() => {
                                    setEditorOpen(true);
                                    setSelectedArtifacts([selectedArtifacts[0]]);
                                }}
                            />
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden', justifyContent: 'center', flex:1, color: '#666', fontStyle: 'italic' }}>
                        Select an artifact to view its details
                    </Box>
                )}

                <Dialog
                    open={deleteConfirmOpen}
                    onClose={() => setDeleteConfirmOpen(false)}
                >
                    <DialogTitle>Delete Artifact</DialogTitle>
                    <DialogContent>
                        <DialogContentText>
                            Are you sure you want to delete {selectedArtifacts.length} selected artifact{selectedArtifacts.length > 1 ? 's' : ''}? This action cannot be undone.
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button onClick={handleDelete} color="error" variant="contained">
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>


            {selectedArtifacts.length === 1 ? (
                <ArtifactEditor
                    open={editorOpen}
                    onClose={() => setEditorOpen(false)}
                    onCreate={handleCreateArtifact}
                    onUpdate={handleCreateArtifact}
                    artifact={selectedArtifacts[0]}
                />
            ) : (
                <ArtifactEditor
                    open={editorOpen}
                    onClose={() => setEditorOpen(false)}
                    onCreate={handleCreateArtifact}
                />
            )}
        </Box>
    );
};
