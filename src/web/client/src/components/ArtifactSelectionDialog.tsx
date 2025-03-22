import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ArtifactType } from '../../../../tools/artifact';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Checkbox,
    FormControlLabel,
    TextField,
    Typography,
    Box
} from '@mui/material';
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';

// Define possible subtypes for each artifact type
const SUBTYPE_MAPPING: Record<ArtifactType, string[]> = {
    [ArtifactType.Spreadsheet]: ['Financial', 'Inventory', 'Project Plan', 'Timesheet'],
    [ArtifactType.Document]: ['Report', 'Proposal', 'Policy', 'Manual'],
    [ArtifactType.Webpage]: ['Blog', 'Documentation', 'Knowledge Base', 'Landing Page'],
    [ArtifactType.Diagram]: ['Flowchart', 'Org Chart', 'Network Diagram', 'Process Map'],
    [ArtifactType.Calendar]: ['Project', 'Team', 'Company', 'Personal'],
    [ArtifactType.APIData]: ['JSON', 'XML', 'CSV', 'GraphQL'],
    [ArtifactType.Presentation]: ['Pitch Deck', 'Training', 'Report', 'Proposal'],
    [ArtifactType.Unknown]: []
};

interface Asset {
    id: string;
    type: ArtifactType;
    metadata: {
        title: string;
        description?: string;
        previewUrl?: string;
        createdAt?: string;
        updatedAt?: string;
    };
}

interface ArtifactSelectionDialogProps {
    assets: Asset[];
    onSelect: (assetIds: string[]) => void;
    onClose: () => void;
}

const columns: GridColDef[] = [
    { 
        field: 'title', 
        headerName: 'Title', 
        width: 200,
        sortable: true
    },
    { 
        field: 'type', 
        headerName: 'Type', 
        width: 150,
        sortable: true
    },
    { 
        field: 'createdAt', 
        headerName: 'Created', 
        width: 180,
        sortable: true,
        valueFormatter: (params) => 
            params ? new Date(params).toLocaleString() : 'N/A'
    },
    { 
        field: 'updatedAt', 
        headerName: 'Last Updated', 
        width: 180,
        sortable: true,
        valueFormatter: (params) => 
            params ? new Date(params).toLocaleString() : 'N/A'
    },
    { 
        field: 'description', 
        headerName: 'Description', 
        width: 300,
        sortable: false,
        valueFormatter: (params) => params || 'No description'
    }
];

export const ArtifactSelectionDialog: React.FC<ArtifactSelectionDialogProps> = ({ assets, onSelect, onClose }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ArtifactType[]>([]);
    const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
    const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);

    // Get available subtypes based on selected types
    const availableSubtypes = useMemo(() => {
        if (selectedTypes.length === 1) {
            return SUBTYPE_MAPPING[selectedTypes[0]] || [];
        }
        return [];
    }, [selectedTypes]);

    const filteredAssets = useMemo(() => {
        return assets
            .filter(asset => {
                const matchesSearch = asset.metadata.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (asset.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

                const matchesType = selectedTypes.length === 0 ||
                    (asset.type && selectedTypes.some(type => 
                        type.toLowerCase() === asset.type?.toLowerCase()
                    ));

                const matchesSubtype = selectedSubtypes.length === 0 ||
                    (asset.metadata.subtype && selectedSubtypes.some(subtype => 
                        subtype.toLowerCase() === asset.metadata.subtype?.toLowerCase()
                    ));

                return matchesSearch && matchesType && matchesSubtype;
            })
            .map(asset => ({
                id: asset.id,
                ...asset.metadata,
                type: asset.type
            }));
    }, [assets, searchTerm, selectedTypes, selectedSubtypes]);

    return createPortal(
        <Dialog
            open={true}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    height: '80vh',
                    display: 'flex'
                }
            }}
        >
            <DialogTitle>Select Assets</DialogTitle>
            <DialogContent sx={{ display: 'flex', p: 0 }}>
                {/* Sidebar */}
                <Box sx={{
                    width: 250,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    p: 2
                }}>
                    <Typography variant="h6" gutterBottom>Filters</Typography>

                    {/* Search */}
                    <TextField
                        fullWidth
                        placeholder="Search assets..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ mb: 2 }}
                    />

                    {/* Type Filters */}
                    <Typography variant="subtitle1" gutterBottom>Types</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        {Object.values(ArtifactType).filter(type => type !== ArtifactType.Unknown).map(type => (
                            <FormControlLabel
                                key={type}
                                control={
                                    <Checkbox
                                        checked={selectedTypes.includes(type)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedTypes([...selectedTypes, type]);
                                            } else {
                                                setSelectedTypes(selectedTypes.filter(t => t !== type));
                                            }
                                        }}
                                    />
                                }
                                label={type}
                            />
                        ))}
                    </Box>

                    {/* Subtype Filters - Only shown when exactly one type is selected */}
                    {availableSubtypes.length > 0 && (
                        <>
                            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                                Subtypes
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                {availableSubtypes.map(subtype => (
                                    <FormControlLabel
                                        key={subtype}
                                        control={
                                            <Checkbox
                                                checked={selectedSubtypes.includes(subtype)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedSubtypes([...selectedSubtypes, subtype]);
                                                    } else {
                                                        setSelectedSubtypes(selectedSubtypes.filter(t => t !== subtype));
                                                    }
                                                }}
                                            />
                                        }
                                        label={subtype}
                                    />
                                ))}
                            </Box>
                        </>
                    )}
                </Box>

                {/* Main Content */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
                        <DataGrid
                            rows={filteredAssets}
                            columns={columns}
                            checkboxSelection
                            disableRowSelectionOnClick
                            rowSelectionModel={rowSelectionModel}
                            onRowSelectionModelChange={(newSelection) => {
                                setRowSelectionModel(newSelection);
                                setSelectedAssets(newSelection as string[]);
                            }}
                            pageSizeOptions={[10, 25, 50]}
                            initialState={{
                                pagination: {
                                    paginationModel: { pageSize: 25, page: 0 }
                                },
                                columns: {
                                    columnVisibilityModel: {
                                        createdAt: false,
                                        type: false
                                    }
                                }
                            }}
                            sx={{
                                '& .MuiDataGrid-cell:focus': {
                                    outline: 'none'
                                }
                            }}
                        />
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={() => {
                        onSelect(selectedAssets);
                        onClose();
                    }}
                >
                    Attach Selected
                </Button>
            </DialogActions>
        </Dialog>,
        document.getElementById('portal-root')!
    );
};
