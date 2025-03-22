import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ArtifactItem } from '../../../../../tools/artifact';
import { Timeline } from '@markwhen/timeline';
import '@markwhen/timeline/dist/Timeline.css';

interface MarkwhenRendererProps {
    content: string;
    artifact?: ArtifactItem;
}

export const MarkwhenRenderer: React.FC<MarkwhenRendererProps> = ({ content, artifact }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [timeline, setTimeline] = useState<Timeline | null>(null);
    
    useEffect(() => {
        if (containerRef.current && !timeline) {
            // Initialize Markwhen timeline
            const newTimeline = new Timeline({
                element: containerRef.current,
                initialView: 'default',
                zoom: true,
                editable: false
            });
            setTimeline(newTimeline);
        }
    }, [timeline]);

    useEffect(() => {
        if (timeline && content) {
            try {
                timeline.parse(content);
            } catch (error) {
                console.error('Error parsing Markwhen content:', error);
            }
        }
    }, [timeline, content]);

    useEffect(() => {
        return () => {
            if (timeline) {
                timeline.destroy();
            }
        };
    }, [timeline]);

    return (
        <Box sx={{ width: '100%', height: '100%', p: 2 }}>
            <Typography variant="h6" gutterBottom>
                {artifact?.metadata?.title || 'Timeline'}
            </Typography>
            <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
        </Box>
    );
};
