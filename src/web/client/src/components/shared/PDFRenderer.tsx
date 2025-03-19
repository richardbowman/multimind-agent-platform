import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface PDFRendererProps {
    content: string;
    mimeType: string;
}

export const PDFRenderer: React.FC<PDFRendererProps> = ({ content, mimeType }) => {
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();
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
        updateActionState('pdf-renderer-prev', { disabled: pageNumber.current === 1 });
        updateActionState('pdf-renderer-next', { disabled: pageNumber.current === totalPages });
    };

    const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

    const handlePreviousPage = useCallback(() => {
        pageNumber.current = Math.max(pageNumber.current - 1, 1);
        updateActionState('pdf-renderer-prev', { disabled: pageNumber.current === 1 });
        updateActionState('pdf-renderer-next', { disabled: pageNumber.current === numPages.current });
        setRenderTrigger(prev => !prev);
    }, []);

    const handleNextPage = useCallback(() => {
        pageNumber.current = Math.min(pageNumber.current + 1, numPages.current || 1);
        updateActionState('pdf-renderer-prev', { disabled: pageNumber.current === 1 });
        updateActionState('pdf-renderer-next', { disabled: pageNumber.current === numPages.current });
        setRenderTrigger(prev => !prev);
    }, []);

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
                disabled: pageNumber.current === numPages.current
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
    }, [registerActions, unregisterActions, handlePreviousPage, handleNextPage]);

    useEffect(() => {
        updateActionState('pdf-renderer-prev', { disabled: pageNumber.current === 1 });
        updateActionState('pdf-renderer-next', { disabled: pageNumber.current === numPages.current });
    }, [updateActionState]);

    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    useEffect(() => {
        // Convert base64 to Blob and create URL
        const binary = atob(content);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([array], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        // Cleanup on unmount
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [content, mimeType]);

    if (!pdfUrl) {
        return <Box>Loading PDF...</Box>;
    }

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: 2
        }}>
            <Paper elevation={3} sx={{ p: 1, maxWidth: '100%', overflow: 'auto' }}>
                <Document
                    file={pdfUrl}
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
        </Box>
    );
};
