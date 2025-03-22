import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { ArtifactItem } from '../../../../../tools/artifact';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface MarkwhenRendererProps {
    content: string;
    artifact?: ArtifactItem;
}

export const MarkwhenRenderer: React.FC<MarkwhenRendererProps> = ({ content, artifact }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (containerRef.current) {
            // Clear previous content
            containerRef.current.innerHTML = '';
            
            // Create timeline container
            const timelineContainer = document.createElement('div');
            timelineContainer.style.width = '100%';
            timelineContainer.style.height = '600px';
            containerRef.current.appendChild(timelineContainer);

            // Initialize Markwhen
            const timeline = new (window as any).Timeline(timelineContainer, {
                initialView: 'default',
                zoom: true,
                editable: false
            });

            // Parse and set Markwhen content
            try {
                timeline.parse(content);
            } catch (error) {
                console.error('Error parsing Markwhen content:', error);
            }

            // Cleanup
            return () => {
                timeline.destroy();
            };
        }
    }, [content]);

    return (
        <Box sx={{ width: '100%', height: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {artifact?.metadata?.title || 'Timeline'}
            </Typography>
            <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
        </Box>
    );
};
