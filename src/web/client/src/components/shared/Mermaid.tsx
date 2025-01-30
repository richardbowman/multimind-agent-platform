import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, IconButton, Dialog, DialogContent, DialogActions, Button } from '@mui/material';
import { Spinner } from '../Spinner';
import mermaid from 'mermaid';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';

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

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 0.25, 3));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
    };

    const handleResetZoom = () => {
        setZoomLevel(1);
    };

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

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

    const renderDiagram = () => (
        <Box
            sx={{
                position: 'relative',
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                transition: 'transform 0.2s ease',
                width: 'fit-content',
                height: 'fit-content'
            }}
            ref={svgContainerRef}
        >
            <div dangerouslySetInnerHTML={{ __html: svg || '' }} />
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
                    position: 'relative',
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
                        <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                            <IconButton
                                size="small"
                                onClick={toggleFullscreen}
                                sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.default' } }}
                            >
                                <FullscreenIcon fontSize="small" />
                            </IconButton>
                        </Box>
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
                        justifyContent: 'center',
                        alignItems: 'center',
                        overflow: 'auto',
                        position: 'relative'
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
