import React from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CSVRenderer } from './CSVRenderer';
import { Mermaid } from './Mermaid';
import { ChartRenderer } from './ChartRenderer';
import { WebpageRenderer } from './WebpageRenderer';
import { Box, Paper, Typography } from '@mui/material';
import { CalendarRenderer } from './CalendarRenderer';
import { PDFRenderer } from './PDFRenderer';
import { SlideRenderer } from './SlideRenderer';
import { ArtifactType } from '../../../../../tools/artifact';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';
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
        return <PDFRenderer content={content} mimeType={mimeType} />;                                                                               
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
    if (type === ArtifactType.Presentation || metadata?.format === 'revealjs') {                                                                    
        return <SlideRenderer content={content} mimeType={mimeType} />;                                                                             
    }

    // Handle webpage content
    if (type === ArtifactType.Webpage || metadata?.mimeType === 'text/html') {
        return <WebpageRenderer content={content} metadata={metadata} />;
    }

    // Handle markdown content
    if (content.length < 1024 * 150 && (type === 'markdown' || type === 'report' || type === ArtifactType.Document || metadata?.mimeType === 'text/markdown')) {
        return <MarkdownRenderer content={content} />;
    } else {
        return <Box sx={{overflow: "auto", p: 2}}><pre>{content}</pre></Box>;
    }
};
