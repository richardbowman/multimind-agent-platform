import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface WebpageRendererProps {
    content: string;
    metadata?: Record<string, any>;
}

export const WebpageRenderer: React.FC<WebpageRendererProps> = ({ content, metadata }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1.0);
    const { registerActions, unregisterActions } = useToolbarActions();

    const zoomIn = useCallback(() => {
        setScale(prev => Math.min(prev + 0.2, 2.0));
    }, []);

    const zoomOut = useCallback(() => {
        setScale(prev => Math.max(prev - 0.2, 0.5));
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (iframeRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                iframeRef.current.requestFullscreen();
            }
        }
    }, []);

    useEffect(() => {
        const webpageActions = [
            {
                id: 'webpage-zoom-in',
                icon: <ZoomInIcon />,
                label: 'Zoom In',
                onClick: zoomIn
            },
            {
                id: 'webpage-zoom-out',
                icon: <ZoomOutIcon />,
                label: 'Zoom Out',
                onClick: zoomOut
            },
            {
                id: 'webpage-fullscreen',
                label: 'Toggle Fullscreen',
                onClick: toggleFullscreen
            }
        ];

        registerActions('webpage', webpageActions);
        return () => unregisterActions('webpage');
    }, [registerActions, unregisterActions, zoomIn, zoomOut, toggleFullscreen]);

    return (
        <Box sx={{
            width: '100%',
            height: '70vh',
            overflow: 'auto',
            p: 2
        }}>
            <Paper elevation={3} sx={{ 
                p: 1,
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                width: `${100 / scale}%`,
                height: `${100 / scale}%`
            }}>
                <iframe
                    ref={iframeRef}
                    srcDoc={content}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: 'white'
                    }}
                    title={metadata?.title || 'Webpage'}
                    sandbox="allow-scripts allow-same-origin"
                />
            </Paper>
        </Box>
    );
};
