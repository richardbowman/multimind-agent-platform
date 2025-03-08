import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact, ArtifactItem, ArtifactType } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import { Typography, Button, Box, Drawer, Toolbar, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { TreeItem2, TreeItem2Content, TreeItem2Props } from '@mui/x-tree-view/TreeItem2';
import { useTreeViewApiRef } from '@mui/x-tree-view/hooks';
import SearchIcon from '@mui/icons-material/Search';
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
import { useArtifacts } from '../contexts/ArtifactContext';
import { CustomScrollbarStyles } from '../styles/styles';

export interface DrawerPage {
    drawerOpen: boolean;
    onDrawerToggle: () => void;
}

export const GlobalArtifactViewer: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const { artifacts: allArtifacts, fetchAllArtifacts, deleteArtifact } = useArtifacts();
    const { showFileDialog } = useDataContext();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact|null>(null);
    const [selectedArtifacts, setSelectedArtifacts] = useState<ArtifactItem[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const treeViewApiRef = useTreeViewApiRef();
    const [artifactFolders, setArtifactFolders] = useState<Record<string, Artifact[]>>({});
    const [filterText, setFilterText] = useState('');
    const [selectedProject, setSelectedProject] = useState<string>('all');
    const [expandedItems, setExpandedItems] = useState<string[]>([]);
    const [availableProjects, setAvailableProjects] = useState<string[]>([]);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const ipcService = useIPCService();

    const baseToolbarActions = useMemo(() => [
        {
            id: 'upload-file',
            icon: <AttachFileIcon />,
            label: 'Upload File',
            onClick: async () => {
                showFileDialog();
            }
        },
        {
            id: 'create-artifact',
            icon: <DescriptionIcon />,
            label: 'Create New Artifact',
            onClick: () => setEditorOpen(true)
        },
        {
            id: 'bulk-delete',
            icon: <DeleteIcon />,
            label: `Bulk Delete Selected (${selectedArtifacts.length})`,
            onClick: () => setDeleteConfirmOpen(true),
            disabled: selectedArtifacts.length < 2,
            color: 'error',
            variant: 'outlined'
        }
    ], [showFileDialog, selectedArtifacts.length]);

    const { actions: toolbarActions, registerActions, unregisterActions, updateActionState } = useToolbarActions();

    useEffect(() => {
        registerActions('global-artifact-viewer', baseToolbarActions);
        return () => unregisterActions('global-artifact-viewer');
    }, [registerActions, unregisterActions]);

    const selectArtifact = async (item: ArtifactItem) => {
        setSelectedArtifacts([item]);
        setSelectedArtifact(await ipcService.getRPC().getArtifact(item.id));
    }

    const handleCreateArtifact = async (artifact: ArtifactItem) => {
        // Update the selected artifact
        selectArtifact(artifact);
        
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
            setSelectedArtifact(null);

            updateActionState('bulk-delete', {
                disabled: true,
                label: 'Bulk Delete Selected (0)'
            });
            fetchAllArtifacts();
            setDeleteConfirmOpen(false);
        }
    };

    useEffect(() => {
        fetchAllArtifacts();
    }, []);

    useEffect(() => {
        if (allArtifacts) {
            // Extract unique projects from artifacts
            const projects = new Set<string>(['all']);
            allArtifacts.forEach(artifact => {
                if (artifact.metadata?.projects) {
                    artifact.metadata.projects.forEach((project: string) => projects.add(project));
                }
            });
            setAvailableProjects(Array.from(projects));

            // Group artifacts by type
            const folders = allArtifacts.reduce((acc, artifact) => {
                const type = artifact.type;
                if (!acc[type]) acc[type] = [];
                acc[type].push(artifact);
                return acc;
            }, {} as Record<string, Artifact[]>);
            setArtifactFolders(folders);
            // Set initial expanded state to all folder types
            setExpandedItems(Object.keys(folders));
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
                    width: 350,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 350,
                        boxSizing: 'border-box'
                    },
                }}
            >
                <Toolbar /> {/* For spacing under app bar */}
                <Box sx={{ 
                    pt: 4,
                    p: 2
                }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Project</InputLabel>
                            <Select
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value as string)}
                                label="Project"
                            >
                                {availableProjects.map(project => (
                                    <MenuItem key={project} value={project}>
                                        {project}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            variant="outlined"
                            size="small"
                            placeholder="Search artifacts..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            InputProps={{
                                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
                            }}
                        />
                    </Box>
                </Box>
                <Box sx={{ 
                    overflowY: 'auto',
                    height: 'calc(100vh - 120px)',
                    ...CustomScrollbarStyles,
                    p: 1
                }}>
                    <RichTreeView
                        items={Object.entries(artifactFolders).flatMap(([type, artifacts]) => {
                            const filteredArtifacts = artifacts.filter(artifact => {
                                // Apply project filter
                                if (selectedProject !== 'all' && 
                                    (!artifact.metadata?.projects || 
                                    !artifact.metadata.projects.includes(selectedProject))) {
                                    return false;
                                }
                                
                                // Apply text filter
                                if (filterText) {
                                    const searchText = filterText.toLowerCase();
                                    return (
                                        artifact.metadata?.title?.toLowerCase().includes(searchText) ||
                                        artifact.type.toLowerCase().includes(searchText) ||
                                        (artifact.content ? artifact.content.toString().toLowerCase().includes(searchText) : false)
                                    );
                                }
                                return true;
                            });

                            return [{
                                id: type,
                                label: `${type} (${filteredArtifacts.length})`,
                                children: filteredArtifacts.map(artifact => ({
                                    id: artifact.id,
                                    label: artifact.metadata?.title || `Untitled ${artifact.type}`,
                                    artifact: artifact
                                }))
                            }];
                        })}
                        multiSelect
                        selectedItems={selectedItemIds}
                        onSelectedItemsChange={(event, newSelection) => {
                            setSelectedItemIds(newSelection);
                            
                            // Update selected artifacts
                            const newArtifacts = Object.values(artifactFolders)
                                .flat()
                                .filter(artifact => newSelection.includes(artifact.id));
                            setSelectedArtifacts(newArtifacts);
                            
                            // Update bulk delete state
                            updateActionState('bulk-delete', {
                                disabled: newSelection.length < 2,
                                label: `Bulk Delete Selected (${newSelection.length})`
                            });
                            
                            // If single selection, show the artifact
                            if (newSelection.length === 1) {
                                const artifact = Object.values(artifactFolders)
                                    .flat()
                                    .find(a => a.id === newSelection[0]);
                                if (artifact) {
                                    selectArtifact(artifact);
                                }
                            }
                        }}
                        slots={{ 
                            item: (props: TreeItem2Props & { item: { artifact?: Artifact } }) => {
                                const artifact = props.item?.artifact;
                                if (!artifact) {
                                    return <TreeItem2 {...props} />;
                                }

                                return (
                                    <TreeItem2 {...props}>
                                        <TreeItem2Content>
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <ArtifactCard
                                                    artifact={artifact}
                                                    selected={selectedItemIds.includes(artifact.id)}
                                                    onClick={(e) => {
                                                        // Let TreeView handle the selection logic
                                                        e.stopPropagation();
                                                    }}
                                                />
                                            </Box>
                                        </TreeItem2Content>
                                    </TreeItem2>
                                );
                            }
                        }}
                        expandedItems={expandedItems}
                        onExpandedItemsChange={(event, newExpandedItems) => setExpandedItems(newExpandedItems)}
                        sx={{
                            '& .MuiTreeItem-content': {
                                padding: '4px 8px',
                                borderRadius: '4px',
                                '&:hover': {
                                    backgroundColor: 'action.hover'
                                }
                            },
                            '& .MuiTreeItem-group': {
                                marginLeft: '16px'
                            }
                        }}
                    />
                </Box>
            </Drawer>
            <Box component="main" sx={{ 
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: drawerOpen ? 0 : '-350px',
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
