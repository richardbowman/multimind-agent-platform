import React from 'react';
import { Box } from '@mui/material';
import { CSVRenderer } from './CSVRenderer';
import { ActionToolbar } from './ActionToolbar';

interface CodeBlockProps {
    language?: string;
    content: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, content }) => {
    if (language === 'csv') {
        return (
            <Box sx={{ 
                mt: 2, 
                mb: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                position: 'relative'
            }}>
                <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                    <ActionToolbar 
                        content={content}
                        title={`CSV Export - ${new Date().toLocaleDateString()}`}
                    />
                </Box>
                <CSVRenderer content={content} />
            </Box>
        );
    }

    return (
        <Box sx={{ 
            position: 'relative',
            mt: 2,
            mb: 2
        }}>
            <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                <ActionToolbar 
                    content={content}
                    title={`Code Export - ${new Date().toLocaleDateString()}`}
                />
            </Box>
            <Box component="pre" sx={{ 
                p: 2, 
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                overflowX: 'auto',
                pt: 6 // Add padding to prevent toolbar overlap
            }}>
                <code>
                    {content}
                </code>
            </Box>
        </Box>
    );
};
