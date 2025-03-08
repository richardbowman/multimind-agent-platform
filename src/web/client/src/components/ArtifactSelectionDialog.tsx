import React, { useState } from 'react';
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

interface ArtifactSelectionDialogProps {
    assets: Array<{
        id: string;
        metadata: {
            title: string;
            description?: string;
            previewUrl?: string;
            type?: ArtifactType;
        };
    }>;
    onSelect: (assetIds: string[]) => void;
    onClose: () => void;
}

export const ArtifactSelectionDialog: React.FC<ArtifactSelectionDialogProps> = ({ assets, onSelect, onClose }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ArtifactType[]>([]);

    const filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.metadata.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (asset.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

        const matchesType = selectedTypes.length === 0 ||
            (asset.metadata.type && selectedTypes.includes(asset.metadata.type));

        return matchesSearch && matchesType;
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
                        {Object.values(ArtifactType).map(type => (
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
