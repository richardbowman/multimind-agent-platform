import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import { Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails, List, Drawer, Toolbar, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper } from '@mui/material';
import { ArtifactEditor } from './ArtifactEditor';
import { ArtifactCard } from './ArtifactCard';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { ActionToolbar } from './shared/ActionToolbar';

export interface DrawerPage {
    drawerOpen: boolean;
    onDrawerToggle: () => void;
}

export const GlobalArtifactViewer: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const { allArtifacts, fetchAllArtifacts, deleteArtifact, showFileDialog } = useDataContext();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [artifactFolders, setArtifactFolders] = useState<Record<string, Artifact[]>>({});
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
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
        }
    ], [showFileDialog]);

    const [toolbarActions, setToolbarActions] = useState(baseToolbarActions);

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
        if (selectedArtifact) {
            await deleteArtifact(selectedArtifact.id);
            setSelectedArtifact(null);
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

    const onDrop = useCallback((acceptedFiles: File[]) => {
        // Handle file uploads
        if (acceptedFiles.length > 0) {
            showFileDialog(acceptedFiles);
        }
    }, [showFileDialog]);

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
                                    <ArtifactCard
                                        key={artifact.id}
                                        artifact={artifact}
                                        selected={selectedArtifact?.id === artifact.id}
                                        onClick={() => setSelectedArtifact(artifact)}
                                        onEdit={() => {
                                            setEditorOpen(true);
                                            setSelectedArtifact(artifact);
                                        }}
                                    />
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
                {selectedArtifact ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', pt: 1 }}>
                            <ArtifactDisplay 
                                artifact={selectedArtifact} 
                                showMetadata={true}
                                onDelete={() => setDeleteConfirmOpen(true)}
                                onEdit={() => {
                                    setEditorOpen(true);
                                    setSelectedArtifact(selectedArtifact);
                                }}
                                onAddToolbarActions={(actions = []) => {
                                    // Keep the first two base actions (Upload File and Create New Artifact)
                                    const baseActions = [
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
                                        }
                                    ];
                                    // Add any new actions after the base actions
                                    // Filter out any duplicate actions based on label
                                    const uniqueActions = Array.isArray(actions) 
                                        ? actions.filter(action => 
                                            !baseActions.some(base => base.label === action.label)
                                          )
                                        : [];
                                    return [...baseActions, ...uniqueActions];
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
                            Are you sure you want to delete this artifact? This action cannot be undone.
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


            {selectedArtifact ? (
                <ArtifactEditor
                    open={editorOpen}
                    onClose={() => setEditorOpen(false)}
                    onCreate={handleCreateArtifact}
                    onUpdate={handleCreateArtifact}
                    artifact={selectedArtifact}
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
