import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { Spinner } from '../Spinner';
import mermaid from 'mermaid';

interface MermaidProps {
    content: string;
}

export const Mermaid: React.FC<MermaidProps> = ({ content }) => {
    const [error, setError] = useState<string | null>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const isMounted = useRef(true);
    const mermaidId = useRef(`mermaid-${Date.now()}-${Math.random().toString().replace('.', '')}`);

    useEffect(() => {
        let isActive = true;
        
        const initializeAndRender = async () => {
            try {
                // Initialize Mermaid with default config
                mermaid.initialize({ 
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'loose',
                    fontFamily: 'inherit',
                    fontSize: 16,
                    logLevel: 'warn'
                });

                // Create temporary container
                const tempDiv = document.createElement('div');
                tempDiv.id = mermaidId.current;
                tempDiv.style.position = 'absolute';
                tempDiv.style.visibility = 'hidden';
                document.body.appendChild(tempDiv);

                // Parse and render the diagram
                await mermaid.parse(content);
                const { svg } = await mermaid.render(mermaidId.current, content);

                if (isActive) {
                    setSvg(svg);
                    setError(null);
                }
            } catch (err) {
                if (isActive) {
                    console.error('Mermaid rendering error:', err);
                    setError(`Error rendering diagram: ${err.message}`);
                }
            } finally {
                // Clean up temporary container
                const tempDiv = document.getElementById(mermaidId.current);
                if (tempDiv) {
                    document.body.removeChild(tempDiv);
                }
            }
        };

        if (content.trim()) {
            initializeAndRender();
        }

        return () => {
            isActive = false;
        };
    }, [content]);

    return (
        <Box 
            sx={{ 
                mt: 2,
                mb: 2,
                p: 2,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: error ? 'error.main' : 'divider',
                borderRadius: 1,
                overflowX: 'auto',
                minHeight: '100px',
                '& svg': {
                    maxWidth: '100%',
                    height: 'auto'
                }
            }}
        >
            {error ? (
                <Typography color="error">{error}</Typography>
            ) : svg ? (
                <div dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
                <Spinner />
            )}
        </Box>
    );
};
