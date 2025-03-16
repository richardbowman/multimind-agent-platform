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
    Grid,
    Paper,
    TextField,
    Typography,
    Box
} from '@mui/material';

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

interface ArtifactSelectionDialogProps {
    assets: Array<{
        id: string;
        type: ArtifactType;
        metadata: {
            title: string;
            description?: string;
            previewUrl?: string;
        };
    }>;
    onSelect: (assetIds: string[]) => void;
    onClose: () => void;
}

export const ArtifactSelectionDialog: React.FC<ArtifactSelectionDialogProps> = ({ assets, onSelect, onClose }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ArtifactType[]>([]);
    const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);

    // Get available subtypes based on selected types
    const availableSubtypes = useMemo(() => {
        if (selectedTypes.length === 1) {
            return SUBTYPE_MAPPING[selectedTypes[0]] || [];
        }
        return [];
    }, [selectedTypes]);

    const filteredAssets = assets.filter(asset => {
        console.log('Asset:', asset.metadata.title, 'Type:', asset.metadata.type);
        
        const matchesSearch = asset.metadata.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (asset.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

        const matchesType = selectedTypes.length === 0 ||
            (asset.type && selectedTypes.some(type => 
                type.toLowerCase() === asset.type?.toLowerCase()
            ));

        // Check subtype match if subtypes are selected
        const matchesSubtype = selectedSubtypes.length === 0 ||
            (asset.metadata.subtype && selectedSubtypes.some(subtype => 
                subtype.toLowerCase() === asset.metadata.subtype?.toLowerCase()
            ));

        console.log('Matches search:', matchesSearch, 'Matches type:', matchesType);
        return matchesSearch && matchesType && matchesSubtype;
    });

    const handleSelect = (assetId: string) => {
        setSelectedAssets(prev =>
            prev.includes(assetId)
                ? prev.filter(id => id !== assetId)
                : [...prev, assetId]
        );
    };

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
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                        <Grid container spacing={2}>
                            {filteredAssets.map(asset => (
                                <Grid item xs={12} sm={6} md={4} lg={3} key={asset.id}>
                                    <Paper
                                        elevation={selectedAssets.includes(asset.id) ? 3 : 1}
                                        sx={{
                                            p: 2,
                                            cursor: 'pointer',
                                            border: selectedAssets.includes(asset.id) ? '2px solid' : '1px solid',
                                            borderColor: selectedAssets.includes(asset.id) ? 'primary.main' : 'divider',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                borderColor: 'primary.main'
                                            }
                                        }}
                                        onClick={() => handleSelect(asset.id)}
                                    >
                                        {asset.metadata.previewUrl && (
                                            <img
                                                src={asset.metadata.previewUrl}
                                                alt={asset.metadata.title}
                                                style={{
                                                    width: '100%',
                                                    height: '100px',
                                                    objectFit: 'cover',
                                                    borderRadius: '4px',
                                                    marginBottom: '8px'
                                                }}
                                            />
                                        )}
                                        <Typography variant="body1">{asset.metadata.title}</Typography>
                                        {asset.metadata.description && (
                                            <Typography variant="body2" color="text.secondary">
                                                {asset.metadata.description}
                                            </Typography>
                                        )}
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
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
