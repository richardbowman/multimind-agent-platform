import React, { useEffect, useState } from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';
import { parse } from 'csv-parse/sync';

interface CSVRendererProps {
    content: string;
}

export const CSVRenderer: React.FC<CSVRendererProps> = ({ content }) => {
    const [rows, setRows] = useState<any[]>([]);
    const [columns, setColumns] = useState<GridColDef[]>([]);

    useEffect(() => {
        try {
            // Parse CSV content using csv-parse
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });

            // Generate rows with IDs
            const parsedRows = records.map((row: any, index: number) => ({
                id: index + 1,
                ...row
            }));

            // Generate columns from headers
            if (parsedRows.length > 0) {
                const columnDefs = Object.keys(parsedRows[0])
                    .filter(key => key !== 'id')
                    .map((key) => ({
                        field: key,
                        headerName: key,
                        width: 150,
                        editable: false,
                    }));

                setColumns(columnDefs);
                setRows(parsedRows);
            }
        } catch (error) {
            console.error('Error parsing CSV:', error);
            // Fallback to raw text view if parsing fails
            setColumns([]);
            setRows([]);
        }
    }, [content]);

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
                />
            ) : (
                <Box component="pre" sx={{ 
                    p: 2, 
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflowX: 'auto',
                    maxHeight: '300px',
                    overflowY: 'auto'
                }}>
                    {content}
                </Box>
            )}
        </Box>
    );
};
