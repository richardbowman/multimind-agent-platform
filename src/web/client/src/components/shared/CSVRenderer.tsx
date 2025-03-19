import React, { useEffect, useState, useRef } from 'react';
import { unstable_debounce as debounce } from '@mui/utils';
import { ArtifactDrawer } from '../ArtifactDrawer';
import { DataGrid, GridColDef, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import { Box, Button } from '@mui/material';
import { parse } from 'csv-parse/browser/esm/sync';
import { stringify } from 'csv-stringify/browser/esm/sync';
import SaveIcon from '@mui/icons-material/Save';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CustomLink } from '../ChatPanel';
import { Artifact } from '../../../../../tools/artifact';
import { useFilteredArtifacts } from '../../contexts/FilteredArtifactContext';
import { useArtifacts } from '../../contexts/ArtifactContext';
import { UUID } from '../../../../../types/uuid';

interface CSVRendererProps {
    content: string;
    onSave?: (csvContent: string) => void;
}

interface CSVRendererState {
    drawerOpen: boolean;
    currentArtifact: Artifact | null;
}

export const CSVRenderer: React.FC<CSVRendererProps & {
    onAddToolbarActions?: (actions: Array<{
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>) => void
}> = ({ content, onSave, onAddToolbarActions }) => {
    const rowsRef = useRef<any[]>([]);
    const [rows, setRows] = useState<any[]>([]);
    const throttledSetRows = debounce(setRows, 750);
    const [columns, setColumns] = useState<GridColDef[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [state, setState] = useState<CSVRendererState>({
        drawerOpen: false,
        currentArtifact: null
    });
    const { artifacts, getArtifact } = useArtifacts();
    const [ artifact, setArtifact ] = useState<Artifact|null>(null);

    useEffect(() => {
        try {
            // Parse CSV content using csv-parse
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_quotes: true,  // Allow quotes in unquoted fields
                relax_column_count: true,  // Handle inconsistent column counts
                bom: true  // Explicitly handle BOM
            });

            // Generate rows with IDs
            const parsedRows = records.map((row: any, index: number) => ({
                id: index + 1,
                ...row
            }));

            // Generate columns from headers
            if (parsedRows.length > 0) {
                const columnDefs: GridColDef[] = Object.keys(parsedRows[0])
                    .filter(key => key !== 'id')
                    .map((key) => ({
                        type: 'string',
                        field: key,
                        headerName: key,
                        width: 150,
                        editable: true,
                        renderCell: (params: GridRenderCellParams<any, string>) => (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    a: (props) => {
                                        if (props.href?.startsWith('/artifact/')) {
                                            // Extract UUID after '/artifact/' prefix
                                            const artifactId = props.href.slice('/artifact/'.length);
                                            // Validate it looks like a UUID
                                            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artifactId)) {
                                                return (
                                                    <span
                                                        style={{
                                                            color: '#1976d2',
                                                            cursor: 'pointer',
                                                            textDecoration: 'underline'
                                                        }}
                                                        onClick={async (e) => {
                                                            try {
                                                                e.preventDefault();
                                                                const item = artifacts.find(a => a.id === artifactId);
                                                                if (item) {
                                                                    const artifact = await getArtifact(item.id);
                                                                    setArtifact(artifact);
                                                                    setState({
                                                                        drawerOpen: true,
                                                                        currentArtifact: null
                                                                    });
                                                                }
                                                            } catch (e) {
                                                                console.error("Error showing artifact link", e);
                                                            }
                                                        }}
                                                    >
                                                        {props.children}
                                                    </span>
                                                );
                                            }
                                            // If it's not a valid UUID, render as plain text
                                            return <span>{props.children}</span>;
                                        }
                                        return <CustomLink {...props} />;
                                    }
                                }}
                            >
                                {params.value || ""}
                            </ReactMarkdown>
                        )
                    }));

                setColumns(columnDefs);
                rowsRef.current = parsedRows;
                throttledSetRows(parsedRows);
            }
        } catch (error) {
            console.error('Error parsing CSV:', error);
            // Fallback to raw text view if parsing fails
            setColumns([]);
            setRows([]);
        }
    }, [content]);

    const handleSave = () => {
        if (rows.length > 0 && columns.length > 0) {
            const data = rows.map(row => {
                const newRow: Record<string, string> = {};
                columns.forEach(col => {
                    newRow[col.field] = row[col.field] || '';
                });
                return newRow;
            });

            const csvContent = stringify(data, {
                header: true,
                columns: columns.map(col => col.field)
            });

            if (onSave) {
                onSave(csvContent);
            }
            setIsDirty(false);
        }
    };

    const handleProcessRowUpdate = (newRow: GridRowModel) => {
        const updatedRows = rowsRef.current.map(row => row.id === newRow.id ? newRow : row);
        rowsRef.current = updatedRows;
        throttledSetRows(updatedRows);
        setIsDirty(true);
        return newRow;
    };

    useEffect(() => {
        if (onAddToolbarActions && rowsRef.current.length > 0) {
            onAddToolbarActions([
                {
                    id: 'csv-renderer-save',
                    icon: <SaveIcon fontSize="small" />,
                    label: 'Save CSV',
                    onClick: handleSave,
                    disabled: !isDirty
                }
            ]);
        }
    }, [isDirty, rows.length]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
            {rows.length > 0 ? (
                <DataGrid
                    rows={rows}
                    columns={columns}
                    pageSize={5}
                    rowsPerPageOptions={[5]}
                    disableSelectionOnClick
                    experimentalFeatures={{ newEditingApi: true }}
                    processRowUpdate={handleProcessRowUpdate}
                    onProcessRowUpdateError={(error) => console.error('Row update error:', error)}
                />
            ) : (
                <Box component="pre" sx={{
                    p: 2,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflowX: 'auto',
                    overflowY: 'auto'
                }}>
                    {content}
                </Box>
            )}
            <ArtifactDrawer
                open={state.drawerOpen}
                onClose={() => setState(prev => ({ ...prev, drawerOpen: false }))}
                currentArtifact={artifact}
                actions={[]}
            />
        </Box>
    );
};
