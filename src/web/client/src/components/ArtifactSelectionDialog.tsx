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
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';

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

type Order = 'asc' | 'desc';

interface HeadCell {
    id: keyof Asset['metadata'];
    label: string;
    sortable: boolean;
}

const headCells: readonly HeadCell[] = [
    { id: 'title', label: 'Title', sortable: true },
    { id: 'type', label: 'Type', sortable: true },
    { id: 'createdAt', label: 'Created', sortable: true },
    { id: 'updatedAt', label: 'Last Updated', sortable: true },
    { id: 'description', label: 'Description', sortable: false }
];

export const ArtifactSelectionDialog: React.FC<ArtifactSelectionDialogProps> = ({ assets, onSelect, onClose }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ArtifactType[]>([]);
    const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Asset['metadata']>('updatedAt');

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
            .sort((a, b) => {
                const aValue = a.metadata[orderBy] || '';
                const bValue = b.metadata[orderBy] || '';
                
                if (order === 'asc') {
                    return aValue > bValue ? 1 : -1;
                }
                return aValue < bValue ? 1 : -1;
            });
    }, [assets, searchTerm, selectedTypes, selectedSubtypes, order, orderBy]);

    const handleRequestSort = (
        event: React.MouseEvent<unknown>,
        property: keyof Asset['metadata'],
    ) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

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
                        <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                indeterminate={
                                                    selectedAssets.length > 0 &&
                                                    selectedAssets.length < filteredAssets.length
                                                }
                                                checked={
                                                    filteredAssets.length > 0 &&
                                                    selectedAssets.length === filteredAssets.length
                                                }
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedAssets(filteredAssets.map(a => a.id));
                                                    } else {
                                                        setSelectedAssets([]);
                                                    }
                                                }}
                                            />
                                        </TableCell>
                                        {headCells.map((headCell) => (
                                            <TableCell
                                                key={headCell.id}
                                                sortDirection={orderBy === headCell.id ? order : false}
                                            >
                                                {headCell.sortable ? (
                                                    <TableSortLabel
                                                        active={orderBy === headCell.id}
                                                        direction={orderBy === headCell.id ? order : 'asc'}
                                                        onClick={(e) => handleRequestSort(e, headCell.id)}
                                                    >
                                                        {headCell.label}
                                                        {orderBy === headCell.id ? (
                                                            <Box component="span" sx={visuallyHidden}>
                                                                {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                                            </Box>
                                                        ) : null}
                                                    </TableSortLabel>
                                                ) : (
                                                    headCell.label
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredAssets.map((asset) => {
                                        const isSelected = selectedAssets.includes(asset.id);
                                        return (
                                            <TableRow
                                                hover
                                                onClick={() => handleSelect(asset.id)}
                                                role="checkbox"
                                                aria-checked={isSelected}
                                                tabIndex={-1}
                                                key={asset.id}
                                                selected={isSelected}
                                                sx={{ cursor: 'pointer' }}
                                            >
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={isSelected}
                                                    />
                                                </TableCell>
                                                <TableCell>{asset.metadata.title}</TableCell>
                                                <TableCell>{asset.type}</TableCell>
                                                <TableCell>
                                                    {asset.metadata.createdAt ? 
                                                        new Date(asset.metadata.createdAt).toLocaleDateString() : 
                                                        'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    {asset.metadata.updatedAt ? 
                                                        new Date(asset.metadata.updatedAt).toLocaleDateString() : 
                                                        'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    {asset.metadata.description || 'No description'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
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
