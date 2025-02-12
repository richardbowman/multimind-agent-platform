import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box } from '@mui/material';

interface MarkdownRendererProps {
    content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
    return (
        <Box sx={{ overflow: "auto", p: 2 }}>
            <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" {...props} />
                }}
            >
                {content}
            </ReactMarkdown>
        </Box>
    );
};
