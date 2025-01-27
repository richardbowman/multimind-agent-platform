import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box } from '@mui/material';

interface CSVRendererProps {
    content: string;
}

export const CSVRenderer: React.FC<CSVRendererProps> = ({ content }) => {
    // Parse CSV content
    const rows = content.split('\n').map((row, index) => {
        const columns = row.split(',');
        return {
            id: index,
            ...columns.reduce((acc, val, i) => {
                acc[`col${i}`] = val;
                return acc;
            }, {} as Record<string, string>)
        };
    });

    // Generate columns from first row
    const columns: GridColDef[] = rows[0] 
        ? Object.keys(rows[0]).map((key, index) => ({
            field: key,
            headerName: key === 'id' ? 'ID' : `Column ${index}`,
            width: 150,
            editable: false,
        }))
        : [];

    return (
        <Box sx={{ height: 400, width: '100%' }}>
            <DataGrid
                rows={rows}
                columns={columns}
                pageSize={5}
                rowsPerPageOptions={[5]}
                disableSelectionOnClick
                experimentalFeatures={{ newEditingApi: true }}
            />
        </Box>
    );
};
