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
        // Initialize Mermaid once
        mermaid.initialize({ 
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
            fontFamily: 'inherit',
            fontSize: 16,
            logLevel: 'warn',
            themeCSS: `
                .mermaid {
                    font-family: inherit;
                }
                .mermaid .label {
                    font-family: inherit;
                    color: #ffffff;
                }
                .mermaid .node rect,
                .mermaid .node circle,
                .mermaid .node ellipse,
                .mermaid .node polygon {
                    fill: #2a2a2a;
                    stroke: #444;
                }
                .mermaid .edgePath .path {
                    stroke: #666;
                }
                .mermaid .cluster rect {
                    fill: #1a1a1a;
                    stroke: #333;
                }
            `
        });

        const renderMermaid = async () => {
            if (!isMounted.current) return;

            try {
                // Create temporary container for rendering
                const tempDiv = document.createElement('div');
                tempDiv.style.visibility = 'hidden';
                document.body.appendChild(tempDiv);

                // Render the diagram
                const { svg } = await mermaid.render(mermaidId.current, content, tempDiv);
                
                if (isMounted.current) {
                    setSvg(svg);
                    setError(null);
                }

                // Clean up temporary container
                document.body.removeChild(tempDiv);
            } catch (err) {
                if (isMounted.current) {
                    console.error('Error rendering mermaid diagram:', err);
                    setError(`Error rendering diagram: ${err.message}`);
                }
            }
        };

        // Only render if content has changed
        if (content.trim()) {
            renderMermaid();
        }

        return () => {
            isMounted.current = false;
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
