
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import TerminalIcon from '@mui/icons-material/Terminal';
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
    const [logs, setLogs] = useState<Array<{ type: string; message: string; timestamp: number }>>([]);
    const [showLogs, setShowLogs] = useState(false);
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

        // Handle messages from the iframe
        // Handle console logs from iframe
        const handleConsoleMessage = (event: MessageEvent) => {
            if (event.source !== iframeWindow) return;
            
            if (event.data.type === 'console') {
                setLogs(prev => [...prev, {
                    type: event.data.level,
                    message: event.data.message,
                    timestamp: Date.now()
                }]);
            }
        };

        // Handle other messages
        const handleMessage = async (event: MessageEvent) => {
            if (event.source !== iframeWindow) return;

            try {
                switch (event.data.type) {
                    case 'loadArtifactContent':
                        // Handle both raw UUIDs and "/artifact/UUID" format
                        const artifactId = event.data.artifactId.startsWith('/artifact/') 
                            ? event.data.artifactId.split('/')[2] 
                            : event.data.artifactId;
                        const artifact = await ipcService.getRPC().getArtifact(artifactId);
                        iframeWindow.postMessage({
                            type: 'loadArtifactContentResponse',
                            requestId: event.data.requestId,
                            content: artifact?.content
                        }, '*');
                        break;
                        
                    case 'getArtifactMetadata':
                        const artifactMeta = await ipcService.getRPC().getArtifact(event.data.artifactId);
                        iframeWindow.postMessage({
                            type: 'getArtifactMetadataResponse',
                            requestId: event.data.requestId,
                            metadata: artifactMeta?.metadata
                        }, '*');
                        break;
                        
                    case 'listAvailableArtifacts':
                        const artifacts = await ipcService.getRPC().listArtifacts();
                        iframeWindow.postMessage({
                            type: 'listAvailableArtifactsResponse',
                            requestId: event.data.requestId,
                            artifacts: artifacts.map(a => ({
                                title: a.metadata?.title || "[Unknown title]",
                                id: a.id,
                                type: a.type,
                                subtype: a.metadata?.subtype
                            }))
                        }, '*');
                        break;
                }
            } catch (error) {
                iframeWindow.postMessage({
                    type: 'error',
                    requestId: event.data.requestId,
                    message: error instanceof Error ? error.message : 'Unknown error'
                }, '*');
            }
        };

        // Inject console logger into iframe
        const injectConsoleLogger = () => {
            if (!iframeRef.current?.contentWindow) return;
            
            const script = `
                const originalConsole = {
                    log: console.log,
                    warn: console.warn,
                    error: console.error,
                    info: console.info,
                    debug: console.debug
                };
                
                ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
                    console[method] = (...args) => {
                        originalConsole[method](...args);
                        window.parent.postMessage({
                            type: 'console',
                            level: method,
                            message: args.map(arg => 
                                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                                .join(' ')
                        }, '*');
                    };
                });
            `;
            
            const scriptEl = iframeRef.current.contentDocument?.createElement('script');
            if (scriptEl) {
                scriptEl.text = script;
                iframeRef.current.contentDocument?.head.appendChild(scriptEl);
            }
        };

        // Wait for iframe to load before injecting
        iframeRef.current?.addEventListener('load', injectConsoleLogger);
        
        window.addEventListener('message', handleConsoleMessage);
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleConsoleMessage);
            window.removeEventListener('message', handleMessage);
            iframeRef.current?.removeEventListener('load', injectConsoleLogger);
        };
    }, [ipcService]);

    useEffect(() => {
        const clearLogs = useCallback(() => setLogs([]), []);

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
            },
            {
                id: 'webpage-show-logs',
                icon: <TerminalIcon />,
                label: `Show Console Logs (${logs.length})`,
                onClick: () => setShowLogs(true),
                disabled: logs.length === 0
            },
            {
                id: 'webpage-clear-logs',
                label: 'Clear Console Logs',
                onClick: clearLogs,
                disabled: logs.length === 0
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

            <Dialog open={showLogs} onClose={() => setShowLogs(false)} maxWidth="md" fullWidth>
                <DialogTitle>Iframe Console Logs</DialogTitle>
                <DialogContent>
                    <List dense>
                        {logs.map((log, index) => (
                            <ListItem key={index}>
                                <ListItemText
                                    primary={log.message}
                                    secondary={`${new Date(log.timestamp).toLocaleTimeString()} [${log.type}]`}
                                    sx={{
                                        fontFamily: 'monospace',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
            </Dialog>
        </Box>
    );
};
