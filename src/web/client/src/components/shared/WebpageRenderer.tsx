
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import { useIPCService } from '../../contexts/IPCContext';
import { ArtifactMetadata } from '../../../../../tools/artifact';
import { subscribe } from 'diagnostics_channel';

interface WebpageRendererProps {
    content: string;
    metadata?: Record<string, any>;
}

export const WebpageRenderer: React.FC<WebpageRendererProps> = ({ content, metadata }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1.0);
    const { registerActions, unregisterActions } = useToolbarActions();
    const ipcService = useIPCService();

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
        if (!iframeRef.current) return;

        const iframeWindow = iframeRef.current.contentWindow;
        if (!iframeWindow) return;

        // Expose artifact methods using IPC
        iframeWindow.loadArtifactContent = async (artifactId: string) : Promise<string> => {
            const artifact = await ipcService.getRPC().getArtifact(artifactId);
            return artifact.content;
        };

        iframeWindow.getArtifactMetadata = async (artifactId: string) : Promise<ArtifactMetadata> => {
            const artifact = await ipcService.getRPC().getArtifact(artifactId);
            return artifact?.metadata;
        };

        iframeWindow.listAvailableArtifacts = async () : Promise<{ title: string, id: string, type: string, subtype: string }[]> => {
            return (await ipcService.getRPC().listArtifacts()).map(a => ({
                title: a.metadata?.title||"[Unknown title]",
                id: a.id,
                type: a.type,
                subtype: a.metadata?.subtype
            }));
        };

        // Cleanup
        return () => {
            delete iframeWindow.loadArtifact;
            delete iframeWindow.getArtifactMetadata;
            delete iframeWindow.listAvailableArtifacts;
        };
    }, [ipcService]);

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
