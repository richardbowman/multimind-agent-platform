import React from 'react';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
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
        <Box sx={{
            position: 'relative',
            width: type === 'file' ? '100px' : '180px',
            height: '100px',
            borderRadius: '4px',
            overflow: 'hidden',
            flexShrink: 0,
            backgroundColor: type === 'artifact' ? '#2a2a2a' : 'transparent',
            padding: type === 'artifact' ? '12px' : '0',
            display: 'flex',
            flexDirection: type === 'artifact' ? 'row' : 'column',
            gap: '8px',
            alignItems: type === 'artifact' ? 'center' : 'stretch',
            border: type === 'artifact' ? '1px solid #444' : 'none'
        }}>
            {type === 'file' && previewUrl && (
                <img
                    src={previewUrl}
                    alt={title}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                />
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
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': {
                        background: 'rgba(255,255,255,0.2)'
                    }
                }}
            >
                ×
            </Box>
        </Box>
    );
};
