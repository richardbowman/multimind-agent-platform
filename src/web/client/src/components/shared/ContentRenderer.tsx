import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CSVRenderer } from './CSVRenderer';
import { Mermaid } from './Mermaid';
import { ChartRenderer } from './ChartRenderer';
import { WebpageRenderer } from './WebpageRenderer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { CalendarRenderer } from './CalendarRenderer';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { ArtifactType, CalendarEvent } from '../../../../../tools/artifact';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
import { StringUtils } from '../../../../../utils/StringUtils';
import { BarChartData } from '../../../../../schemas/BarChartData';

interface ContentRendererProps {
    content: any;
    type?: string;
    mimeType?: string;
    metadata?: Record<string, any>;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({
    content,
    type,
    metadata
}) => {
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();
    const mimeType = metadata?.mimeType;

    // Handle CSV content
    if (mimeType === 'text/csv' || type === 'csv' || type == ArtifactType.Spreadsheet) {
        return <CSVRenderer content={content} />;
    }

    // Handle Mermaid diagrams
    if (type === 'mermaid' || type == ArtifactType.Diagram) {
        return <Mermaid content={content} />;
    }

    // Handle image content
    if (mimeType?.startsWith('image/')) {
        let dataUrl;
        if (typeof content === 'string') {
            if (content.startsWith('data:')) {
                dataUrl = content;
            } else {
                dataUrl = `data:${mimeType};base64,${content}`;
            }
        } else if (content instanceof ArrayBuffer) {
            const bytes = new Uint8Array(content);
            const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
            const base64 = btoa(binary);
            dataUrl = `data:${mimeType};base64,${base64}`;
        } else if (content instanceof Uint8Array) {
            const binary = content.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
            const base64 = btoa(binary);
            dataUrl = `data:${mimeType};base64,${base64}`;
        } else {
            console.error('Unsupported image content type:', typeof content);
            return <Typography color="error">Unsupported image format</Typography>;
        }

        return (
            <Box sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                p: 2
            }}>
                <Paper elevation={3} sx={{ p: 1, maxWidth: '100%', maxHeight: '70vh' }}>
                    <img
                        src={dataUrl}
                        alt={metadata?.title || 'Image artifact'}
                        style={{
                            maxWidth: '100%',
                            maxHeight: '70vh',
                            objectFit: 'contain'
                        }}
                    />
                </Paper>
            </Box>
        );
    }

    // Handle calendar content
    if (mimeType === 'text/calendar' || type === 'calendar' || type == ArtifactType.Calendar) {
        return <CalendarRenderer events={content} />;
    }

    if (type === "javascript" || type === ArtifactType.APIData || mimeType === "application/json") {
        return <Box sx={{overflow: "auto"}}><pre>{content}</pre></Box>;
    }

    // Handle PDF content
    if (mimeType === 'application/pdf' || type === 'pdf') {
        const numPages = useRef<number | null>(null);
        const pageNumber = useRef(1);
        const [scale, setScale] = useState(1.0);
        const [renderTrigger, setRenderTrigger] = useState(false);

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();

        const handleLoadSuccess = ({ numPages: totalPages }: { numPages: number }) => {
            numPages.current = totalPages;
            // Update action states after loading
            updateActionState('Previous Page', { disabled: pageNumber.current === 1 });
            updateActionState('Next Page', { disabled: pageNumber.current === totalPages });
        };

        const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
        const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

        // Create stable action handlers that don't change on re-render
        const handlePreviousPage = useCallback(() => {
            pageNumber.current = Math.max(pageNumber.current - 1, 1);
            updateActionState('pdf-renderer-prev', { disabled: pageNumber.current === 1 });
            updateActionState('pdf-renderer-next', { disabled: pageNumber.current === numPages.current });
            setRenderTrigger(prev => !prev); // Trigger re-render
        }, []);

        const handleNextPage = useCallback(() => {
            pageNumber.current = Math.min(pageNumber.current + 1, numPages.current || 1);
            updateActionState('Previous Page', { disabled: pageNumber.current === 1 });
            updateActionState('Next Page', { disabled: pageNumber.current === numPages.current });
            setRenderTrigger(prev => !prev); // Trigger re-render
        }, []);

        // Register actions once on mount
        useEffect(() => {
            const pdfActions = [
                {
                    id: 'pdf-renderer-prev',
                    icon: <NavigateBeforeIcon />,
                    label: 'Previous Page',
                    onClick: handlePreviousPage,
                    disabled: pageNumber.current === 1
                },
                {
                    id: 'pdf-renderer-next',
                    icon: <NavigateNextIcon />,
                    label: 'Next Page',
                    onClick: handleNextPage,
                    disabled: pageNumber.current === numPages
                },
                {
                    id: 'pdf-renderer-zoom-out',
                    icon: <ZoomOutIcon />,
                    label: 'Zoom Out',
                    onClick: zoomOut
                },
                {
                    id: 'pdf-renderer-zoom-in',
                    icon: <ZoomInIcon />,
                    label: 'Zoom In',
                    onClick: zoomIn
                }
            ];

            registerActions('pdf-renderer', pdfActions);
            return () => unregisterActions('pdf-renderer');
        }, [registerActions, unregisterActions]);

        // Initial action state setup
        useEffect(() => {
            updateActionState('Previous Page', { disabled: pageNumber.current === 1 });
            updateActionState('Next Page', { disabled: pageNumber.current === numPages.current });
        }, [updateActionState]);

        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 2
            }}>

                <Paper elevation={3} sx={{ p: 1, maxWidth: '100%', overflow: 'auto' }}>
                    <Document
                        file={`data:${mimeType};base64,${content}`}
                        onLoadSuccess={handleLoadSuccess}
                    >
                        <Page
                            pageNumber={pageNumber.current}
                            scale={scale}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                        />
                    </Document>
                </Paper>

                <Typography variant="caption" sx={{ mt: 1 }}>
                    Page {pageNumber.current} of {numPages.current}
                </Typography>

                {(
                    <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
                        <IconButton
                            onClick={handlePreviousPage}
                            size="small"
                            disabled={pageNumber.current === 1}
                        >
                            <NavigateBeforeIcon />
                        </IconButton>
                        <IconButton
                            onClick={handleNextPage}
                            size="small"
                            disabled={pageNumber.current === numPages.current}
                        >
                            <NavigateNextIcon />
                        </IconButton>
                        <IconButton onClick={zoomOut} size="small">
                            <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={zoomIn} size="small">
                            <ZoomInIcon />
                        </IconButton>
                    </Box>
                )}
            </Box>
        );
    }

    // Handle chart data
    if (type === 'chart-data' || metadata?.chartType) {
        try {
            const chartData = JSON.parse(content) as BarChartData;
            return <ChartRenderer data={chartData} />;
        } catch (error) {
            console.error('Error parsing chart data:', error);
            return <Typography color="error">Invalid chart data format</Typography>;
        }
    }

    // Handle binary content
    if (type === 'binary' || metadata?.format === 'binary') {
        return <pre>Binary content</pre>;
    }

    // Handle Reveal.js presentations
    if (type === ArtifactType.PRESENTATION || metadata?.format === 'revealjs') {
        const htmlContent = typeof content === 'string' ? content : new TextDecoder().decode(content);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const iframeRef = useRef<HTMLIFrameElement>(null);

        const [currentSlide, setCurrentSlide] = useState(0);
        const [totalSlides, setTotalSlides] = useState(0);

        const navigateSlide = useCallback((direction: 'prev' | 'next') => {
            if (iframeRef.current) {
                iframeRef.current.contentWindow?.postMessage(
                    JSON.stringify({
                        method: direction === 'prev' ? 'left' : 'right'
                    }),
                    '*'
                );
                iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'availableRoutes' }), '*');
            }
        }, []);

        // Listen for slide changes
        useEffect(() => {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.namespace === 'reveal') {
                        if (data.eventName === 'callback' && data.method === 'getTotalSlides') {
                            setTotalSlides(data.result);

                        }
                        if (data.eventName === 'callback' && data.method === 'availableRoutes') {
                            updateActionState('reveal-prev', { disabled: !data.result.left });
                            updateActionState('reveal-next', { disabled: !data.result.right });
                        }
                        if (data.eventName === 'slidechanged') {
                            updateActionState('reveal-slide-number', { label: `Slide ${data.indexh} of ${totalSlides}` });
                        }
                        if (data.eventName === 'ready') {
                            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'getTotalSlides' }), '*');
                            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'availableRoutes' }), '*');
                        }
                    }
                } catch (error) {
                    console.error('Error handling Reveal.js message:', error);
                }
            };

            window.addEventListener('message', handleMessage);

            return () => window.removeEventListener('message', handleMessage);
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
            const presentationActions = [
                {
                    id: 'reveal-prev',
                    icon: <NavigateBeforeIcon />,
                    label: 'Previous Slide',
                    onClick: () => navigateSlide('prev'),
                    disabled: currentSlide === 1
                },
                {
                    id: 'reveal-next',
                    icon: <NavigateNextIcon />,
                    label: 'Next Slide',
                    onClick: () => navigateSlide('next'),
                    disabled: currentSlide === totalSlides
                },
                {
                    id: 'reveal-fullscreen',
                    label: 'Toggle Fullscreen',
                    onClick: toggleFullscreen
                },
                {
                    id: 'reveal-slide-number',
                    label: `Slide ${currentSlide} of ${totalSlides}`,
                    disabled: true
                }
            ];

            registerActions('reveal', presentationActions);
            return () => unregisterActions('reveal');
        }, [registerActions, unregisterActions]);

        return (
            <Box sx={{
                width: '100%',
                height: '70vh',
                border: '1px solid #ddd',
                borderRadius: '4px',
                overflow: 'hidden'
            }}>
                <iframe
                    ref={iframeRef}
                    src={url}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none'
                    }}
                    title="Reveal.js Presentation"
                    allowFullScreen
                />
            </Box>
        );
    }

    // Handle webpage content
    if (type === ArtifactType.Webpage || metadata?.mimeType === 'text/html') {
        return <WebpageRenderer content={content} metadata={metadata} />;
    }

    // Handle markdown content
    if (content.length < 1024 * 10 && (type === 'markdown' || type === 'report' || type === ArtifactType.Document || metadata?.mimeType === 'text/markdown')) {
        return <MarkdownRenderer content={content} />;
    } else {
        return <Box sx={{overflow: "auto", p: 2}}><pre>{content}</pre></Box>;
    }
};
