import React from 'react';
import { Box, IconButton, Tooltip, Menu, MenuItem } from '@mui/material';
import {
    Save as SaveIcon,
    FileDownload as ExportIcon,
    MoreVert as MoreIcon
} from '@mui/icons-material';
import { useIPCService } from '../../contexts/IPCContext';

interface ActionToolbarProps {
    content: string;
    title?: string;
    onSave?: (artifact: any) => void;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({ content, title, onSave }) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const ipcService = useIPCService();
    const open = Boolean(anchorEl);

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSaveAsArtifact = async () => {
        try {
            const artifact = await ipcService.getRPC().createArtifact({
                title: title || 'New Artifact',
                content,
                type: 'markdown',
                metadata: {
                    source: 'chat',
                    createdAt: new Date().toISOString()
                }
            });
            if (onSave) {
                onSave(artifact);
            }
            handleClose();
        } catch (error) {
            console.error('Error saving artifact:', error);
        }
    };

    const handleExport = async (format: 'markdown' | 'pdf' | 'html') => {
        try {
            await ipcService.getRPC().exportContent({
                content,
                format,
                fileName: title ? `${title}.${format}` : `export.${format}`
            });
            handleClose();
        } catch (error) {
            console.error('Error exporting content:', error);
        }
    };

    return (
        <Box sx={{
            width: '100%',
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            padding: 1,
            alignItems: 'center',
            justifyContent: 'flex-end'
        }}>
            <Tooltip title="Save as Artifact">
                <IconButton
                    size="small"
                    onClick={handleSaveAsArtifact}
                >
                    <SaveIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Tooltip title="Export Options">
                <IconButton
                    size="small"
                    onClick={handleMenuClick}
                >
                    <MoreIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <MenuItem onClick={() => handleExport('markdown')}>
                    <ExportIcon fontSize="small" sx={{ mr: 1 }} />
                    Export as Markdown
                </MenuItem>
                <MenuItem onClick={() => handleExport('pdf')}>
                    <ExportIcon fontSize="small" sx={{ mr: 1 }} />
                    Export as PDF
                </MenuItem>
                <MenuItem onClick={() => handleExport('html')}>
                    <ExportIcon fontSize="small" sx={{ mr: 1 }} />
                    Export as HTML
                </MenuItem>
            </Menu>
        </Box>
    );
};
