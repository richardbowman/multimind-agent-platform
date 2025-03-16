import React from 'react';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { Box, Typography } from '@mui/material';

interface AttachmentCardProps {
    type: 'file' | 'artifact';
    title: string;
    subtitle?: string;
    previewUrl?: string;
    onRemove: () => void;
    onClick?: () => void;
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({ 
    type, 
    title, 
    subtitle, 
    previewUrl, 
    onRemove,
    onClick
}) => {
    return (
        <Box 
            onClick={(e) => {
                e.stopPropagation();
                onClick?.();
            }}
            sx={{
            position: 'relative',
            width: '240px',
            height: '80px',
            borderRadius: '4px',
            overflow: 'hidden',
            flexShrink: 0,
            backgroundColor: type === 'artifact' ? (theme) => theme.palette.background.paper : 'transparent',
            padding: type === 'artifact' ? '12px' : '0',
            display: 'flex',
            flexDirection: type === 'artifact' ? 'row' : 'column',
            gap: '8px',
            alignItems: type === 'artifact' ? 'center' : 'stretch',
            border: type === 'artifact' ? (theme) => `1px solid ${theme.palette.divider}` : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: (theme) => theme.shadows[2],
                backgroundColor: type === 'artifact' ? (theme) => theme.palette.action.hover : (theme) => theme.palette.action.hover
            }
        }}>
            {type === 'file' && (
                <Box sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: (theme) => theme.palette.background.paper,
                    p: 2
                }}>
                    {previewUrl && previewUrl.startsWith('data:image/') ? (
                        <img
                            src={previewUrl}
                            alt={title}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <>
                            {previewUrl?.includes('pdf') ? (
                                <PictureAsPdfIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                            ) : previewUrl?.startsWith('data:image/') ? (
                                <ImageIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                            ) : (
                                <InsertDriveFileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                            )}
                            <Typography variant="body2" sx={{ 
                                ml: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100px'
                            }}>
                                {title}
                            </Typography>
                        </>
                    )}
                </Box>
            )}
            
            {type === 'artifact' && (
                <>
                    {subtitle === 'webpage' ? (
                        <LanguageIcon sx={{ 
                            fontSize: '32px', 
                            color: 'text.secondary',
                            flexShrink: 0
                        }} />
                    ) : (
                        <DescriptionIcon sx={{ 
                            fontSize: '32px', 
                            color: 'text.secondary',
                            flexShrink: 0
                        }} />
                    )}
                    <Box sx={{ 
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                        <Typography variant="body2" sx={{ 
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: 'text.primary'
                        }}>
                            {title}
                        </Typography>
                        <Typography variant="caption" sx={{ 
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {subtitle}
                        </Typography>
                    </Box>
                </>
            )}

            <Box
                component="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                sx={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: (theme) => theme.palette.action.active,
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    color: (theme) => theme.palette.common.white,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': {
                        background: (theme) => theme.palette.action.hover
                    }
                }}
            >
                ×
            </Box>
        </Box>
    );
};
