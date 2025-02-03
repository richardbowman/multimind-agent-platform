import React, { useState } from 'react';
import { CSVRenderer } from './CSVRenderer';
import { Mermaid } from './Mermaid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Document, Page, pdfjs } from 'react-pdf';
import * as pdfjsLib from 'pdfjs-dist/webpack.mjs';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { Artifact, ArtifactType, CalendarEvent } from '../../../../../tools/artifact';

interface ContentRendererProps {
    content: any;
    type?: string;
    mimeType?: string;
    metadata?: Record<string, any>;
    onAddToolbarActions?: (actions: Array<{
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>) => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ 
    content, 
    type, 
    metadata,
    onAddToolbarActions 
}) => {
    const mimeType = metadata?.mimeType;
    
    // Handle CSV content
    if (mimeType === 'text/csv' || type === 'csv' || type == ArtifactType.Spreadsheet) {
        return <CSVRenderer content={content} onAddToolbarActions={onAddToolbarActions} />;
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
        const localizer = momentLocalizer(moment);
        const events = (content as CalendarEvent[]).map(event => ({
            title: event.title,
            start: new Date(event.start),
            end: new Date(event.end),
            description: event.description,
            location: event.location
        }));

        return (
            <Box sx={{ height: '70vh', mt: 2 }}>
                <Calendar
                    localizer={localizer}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    defaultView="month"
                    views={['month', 'week', 'day']}
                    style={{ height: '100%' }}
                />
            </Box>
        );
    }

    if (type === "javascript") {
        return <pre>{content}</pre>;
    }

    // Handle PDF content
    if (mimeType === 'application/pdf' || type === 'pdf') {
        const [numPages, setNumPages] = useState<number | null>(null);
        const [pageNumber, setPageNumber] = useState(1);
        const [scale, setScale] = useState(1.0);

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString();

        const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
            setNumPages(numPages);
        };

        const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
        const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

        return (
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                p: 2
            }}>
                <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
                    <IconButton 
                        onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))} 
                        size="small"
                        disabled={pageNumber === 1}
                    >
                        <NavigateBeforeIcon />
                    </IconButton>
                    <IconButton 
                        onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages || 1))} 
                        size="small"
                        disabled={pageNumber === numPages}
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
                
                <Paper elevation={3} sx={{ p: 1, maxWidth: '100%', overflow: 'auto' }}>
                    <Document
                        file={`data:${mimeType};base64,${content}`}
                        onLoadSuccess={handleLoadSuccess}
                    >
                        <Page 
                            pageNumber={pageNumber} 
                            scale={scale}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                        />
                    </Document>
                </Paper>
                
                <Typography variant="caption" sx={{ mt: 1 }}>
                    Page {pageNumber} of {numPages}
                </Typography>
            </Box>
        );
    }

    // Handle binary content
    if (type === 'binary' || metadata?.format === 'binary') {
        return <pre>Binary content</pre>;
    }
    
    if (type === 'markdown' || metadata?.mimeType === 'text/markdown') {
        return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
    } else {
        return <pre>{content}</pre>;
    }
};
