import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Typography, Dialog, DialogContent, DialogActions, Button } from '@mui/material';
import { Spinner } from '../Spinner';
import mermaid from 'mermaid';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface MermaidProps {
    content: string;
}

export const Mermaid: React.FC<MermaidProps> = ({ content }) => {
    const [error, setError] = useState<string | null>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const isMounted = useRef(true);
    const mermaidId = useRef(`mermaid-${Date.now()}-${Math.random().toString().replace('.', '')}`);
    const svgContainerRef = useRef<HTMLDivElement>(null);
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();

    const handleZoomIn = useCallback(() => {
        setZoomLevel(prev => Math.min(prev + 0.25, 3));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
    }, []);

    const handleResetZoom = useCallback(() => {
        setZoomLevel(1);
    }, []);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(prev => !prev);
    }, []);

    useEffect(() => {
        const mermaidActions = [
            {
                id: 'mermaid-zoom-in',
                label: 'Zoom In',
                onClick: handleZoomIn,
                disabled: zoomLevel >= 3
            },
            {
                id: 'mermaid-zoom-out',
                label: 'Zoom Out',
                onClick: handleZoomOut,
                disabled: zoomLevel <= 0.5
            },
            {
                id: 'mermaid-reset-zoom',
                label: 'Reset Zoom',
                onClick: handleResetZoom
            },
            {
                id: 'mermaid-fullscreen',
                label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
                onClick: toggleFullscreen
            }
        ];

        registerActions('mermaid', mermaidActions);
        return () => unregisterActions('mermaid');
    }, [registerActions, unregisterActions, handleZoomIn, handleZoomOut, handleResetZoom, toggleFullscreen, zoomLevel, isFullscreen]);

    // Update action states when zoom level changes
    useEffect(() => {
        updateActionState('mermaid-zoom-in', { disabled: zoomLevel >= 3 });
        updateActionState('mermaid-zoom-out', { disabled: zoomLevel <= 0.5 });
    }, [zoomLevel, updateActionState]);

    // Update fullscreen action label
    useEffect(() => {
        updateActionState('mermaid-fullscreen', { 
            label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'
        });
    }, [isFullscreen, updateActionState]);

    useEffect(() => {
        let isActive = true;
        let tempDiv: HTMLDivElement | null = null;
        let cleanupTimeout: NodeJS.Timeout | null = null;

        const initializeAndRender = async () => {
            try {
                // Initialize Mermaid with default config
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'loose',
                    fontFamily: 'inherit',
                    fontSize: 16,
                    logLevel: 'error'
                });

                // Create new temporary container
                tempDiv = document.createElement('div');
                const tempId = `mermaid-temp-${Date.now()}`;
                tempDiv.id = tempId;
                tempDiv.style.position = 'absolute';
                tempDiv.style.visibility = 'hidden';
                document.body.appendChild(tempDiv);

                // Parse and render the diagram
                await mermaid.parse(content);
                const { svg } = await mermaid.render(tempId, content);

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
                // Schedule cleanup with a small delay
                cleanupTimeout = setTimeout(() => {
                    if (tempDiv && tempDiv.parentNode === document.body) {
                        document.body.removeChild(tempDiv);
                    }
                }, 100);
            }
        };

        if (content.trim()) {
            initializeAndRender();
        }

        return () => {
            isActive = false;
            if (cleanupTimeout) {
                clearTimeout(cleanupTimeout);
            }
            if (tempDiv && tempDiv.parentNode === document.body) {
                document.body.removeChild(tempDiv);
            }
        };
    }, [content]);

    // Panning state
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setStartPos({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - startPos.x,
                y: e.clientY - startPos.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const renderDiagram = () => (
        <Box
            sx={{
                position: 'relative',
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                transition: 'transform 0.2s ease',
                cursor: isDragging ? 'grabbing' : 'grab',
                overflow: 'hidden',
                flexDirection: 'column',
                flex: 1,
                display: 'flex',
                width: '100%'
            }}
            ref={svgContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease',
                    flexDirection: 'column',
                    flex: 1,
                    display: 'flex'
                }}
                dangerouslySetInnerHTML={{ __html: svg || '' }}
            />
        </Box>
    );

    return (
        <>
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
                    flexDirection: 'column',
                    flex: 1,
                    display: 'flex',
                    '& svg': {
                        maxWidth: '100%',
                        height: 'auto'
                    }
                }}
            >
                {error ? (
                    <Typography color="error">{error}</Typography>
                ) : svg ? (
                    <>
                        {renderDiagram()}
                    </>
                ) : (
                    <Spinner />
                )}
            </Box>

            <Dialog
                open={isFullscreen}
                onClose={toggleFullscreen}
                maxWidth="xl"
                fullWidth
                sx={{
                    '& .MuiDialog-paper': {
                        height: '90vh',
                        overflow: 'hidden'
                    }
                }}
            >
                <DialogContent
                    sx={{
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        overflow: 'hidden',
                        touchAction: 'none',
                        userSelect: 'none'
                    }}
                >
                    {renderDiagram()}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
                    <Box>
                        <IconButton onClick={handleZoomIn} disabled={zoomLevel >= 3}>
                            <ZoomInIcon />
                        </IconButton>
                        <IconButton onClick={handleZoomOut} disabled={zoomLevel <= 0.5}>
                            <ZoomOutIcon />
                        </IconButton>
                        <Button onClick={handleResetZoom}>Reset Zoom</Button>
                    </Box>
                    <IconButton onClick={toggleFullscreen}>
                        <FullscreenExitIcon />
                    </IconButton>
                </DialogActions>
            </Dialog>
        </>
    );
};
