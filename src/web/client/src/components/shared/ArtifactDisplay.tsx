import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact, CalendarEvent } from '../../../../../tools/artifact';
import remarkGfm from 'remark-gfm'
import { Box, Button, Typography, Paper } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import { CSVRenderer } from './CSVRenderer';
import { Mermaid } from './Mermaid';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps & { onAddToolbarActions?: (actions: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}>) => void }> = ({
    artifact,
    showMetadata = true,
    onDelete,
    onEdit,
    onAddToolbarActions
}) => {
    const handleExport = () => {
        let fileContent = '';
        // Clean the filename by removing any existing extensions
        let fileName = (artifact.metadata?.title || 'artifact').replace(/\.[^/.]+$/, "");
        let mimeType = 'text/plain';

        // Handle different content types
        if (artifact.metadata?.mimeType?.startsWith('image/')) {
            let binaryData;
            if (typeof artifact.content === 'string') {
                if (artifact.content.startsWith('data:')) {
                    // Extract base64 data from data URL
                    binaryData = atob(artifact.content.split(',')[1]);
                } else {
                    // Assume it's already base64
                    binaryData = atob(artifact.content);
                }
            } else if (artifact.content instanceof ArrayBuffer) {
                binaryData = String.fromCharCode(...new Uint8Array(artifact.content));
            } else if (artifact.content instanceof Uint8Array) {
                binaryData = String.fromCharCode(...artifact.content);
            } else {
                throw new Error('Unsupported image content type');
            }
            
            // Convert binary string to Uint8Array
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
            }
            
            fileContent = bytes;
            mimeType = artifact.metadata.mimeType;
            fileName = `${fileName}.${mimeType.split('/')[1]}`;
        } else if (artifact.type === 'csv' || artifact.metadata?.mimeType === 'text/csv') {
            fileContent = artifact.content as string;
            fileName += '.csv';
            mimeType = 'text/csv';
        } else {
            fileContent = artifact.content as string;
            fileName += '.md';
        }

        // Create blob and download
        const blob = new Blob([fileContent], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (onAddToolbarActions && artifact) {
            const actions = [
                {
                    icon: <EditIcon fontSize="small" />,
                    label: 'Edit Artifact',
                    onClick: () => onEdit && onEdit()
                },
                {
                    icon: <DeleteIcon fontSize="small" />,
                    label: 'Delete Artifact',
                    onClick: () => onDelete && onDelete()
                },
                {
                    icon: <DownloadIcon fontSize="small" />,
                    label: 'Export Artifact',
                    onClick: handleExport
                }
            ];
            onAddToolbarActions(actions);
        }
    }, [artifact.id]); // Only update when artifact ID changes
    return (
        <Box component="main" sx={{ 
            flexGrow: 1, 
            display: 'flex',
            flexDirection: "column",
            flex: 1,
            position: 'relative',
            height: (artifact.metadata?.format === 'csv' || artifact.type === 'csv') ? '100%': undefined
        }}>
            <div className="artifact-detail-header">
                <h2>{artifact.metadata?.title || artifact.id}</h2>
                <div className="artifact-meta">
                    <span className="artifact-type-badge">{artifact.type}</span>
                    <span className="artifact-id">#{artifact.id}</span>
                </div>
            </div>
            <div className="artifact-content" style={{display: "flex", flexDirection:"column", overflow: "hidden"}}>
                {showMetadata && (
                    <table style={{ 
                        width: '100%',
                        fontSize: '0.875rem',
                        borderCollapse: 'collapse',
                        marginBottom: '1rem'
                    }}>
                        <tbody>
                            {artifact.metadata && Object.entries(artifact.metadata)
                                .filter(([key]) => key !== 'binary' && key !== 'format' && key !== 'title')
                                .map(([key, value]) => (
                                    <tr key={key} style={{ borderBottom: '1px solid #444' }}>
                                        <td style={{ 
                                            padding: '4px 8px',
                                            fontWeight: 500,
                                            color: '#aaa',
                                            width: '30%'
                                        }}>{key}</td>
                                        <td style={{ 
                                            padding: '4px 8px',
                                            color: '#ddd',
                                            wordBreak: 'break-word'
                                        }}>
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                )}
                {(() => {
                    // Handle CSV content
                    if (artifact.metadata?.mimeType === 'text/csv' || artifact.type === 'csv') {
                        return <CSVRenderer 
                            content={artifact.content as string} 
                            onSave={(csvContent) => {
                                // Update the artifact content
                                const updatedArtifact = {
                                    ...artifact,
                                    content: csvContent
                                };
                                // Call the onEdit handler if available
                                if (onEdit) {
                                    onEdit();
                                }
                                // Update the toolbar actions to show save state
                                if (onAddToolbarActions) {
                                    onAddToolbarActions([
                                        {
                                            icon: <EditIcon fontSize="small" />,
                                            label: 'Edit Artifact',
                                            onClick: () => onEdit && onEdit()
                                        },
                                        {
                                            icon: <DeleteIcon fontSize="small" />,
                                            label: 'Delete Artifact',
                                            onClick: () => onDelete && onDelete()
                                        },
                                        {
                                            icon: <DownloadIcon fontSize="small" />,
                                            label: 'Export Artifact',
                                            onClick: handleExport
                                        }
                                    ]);
                                }
                            }}
                        />;
                    }

                    // Handle Mermaid diagrams
                    if (artifact.type === 'mermaid') {
                        return <Mermaid content={artifact.content as string} />;
                    }
                    
                    // Handle image content
                    if (artifact.metadata?.mimeType?.startsWith('image/')) {
                        let dataUrl;
                        if (typeof artifact.content === 'string') {
                            // If it's already a data URL, use it directly
                            if (artifact.content.startsWith('data:')) {
                                dataUrl = artifact.content;
                            } else {
                                // If it's base64 without prefix, add it
                                dataUrl = `data:${artifact.metadata.mimeType};base64,${artifact.content}`;
                            }
                        } else if (artifact.content instanceof ArrayBuffer) {
                            // Convert ArrayBuffer to base64
                            const bytes = new Uint8Array(artifact.content);
                            const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                            const base64 = btoa(binary);
                            dataUrl = `data:${artifact.metadata.mimeType};base64,${base64}`;
                        } else if (artifact.content instanceof Uint8Array) {
                            // Convert Uint8Array to base64
                            const binary = artifact.content.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                            const base64 = btoa(binary);
                            dataUrl = `data:${artifact.metadata.mimeType};base64,${base64}`;
                        } else {
                            console.error('Unsupported image content type:', typeof artifact.content);
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
                                        alt={artifact.metadata?.title || 'Image artifact'} 
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
                    if (artifact.mimeType === 'text/calendar' || artifact.type === 'calendar') {
                        const [events, setEvents] = useState<CalendarEvent[]>([]);
                        const [currentDate, setCurrentDate] = useState(new Date());
                        const localizer = momentLocalizer(moment);

                        const handleNavigate = (newDate: Date) => {
                            setCurrentDate(newDate);
                        };

                        useEffect(() => {
                            try {
                                // Expecting artifact.content to be already parsed into CalendarEvent[]
                                if (Array.isArray(artifact.content)) {
                                    const calendarEvents = (artifact.content as CalendarEvent[]).map(event => ({
                                        title: event.title,
                                        start: new Date(event.start),
                                        end: new Date(event.end),
                                        description: event.description,
                                        location: event.location
                                    }));
                                    setEvents(calendarEvents);
                                }
                            } catch (error) {
                                console.error('Error processing calendar events:', error);
                            }
                        }, [artifact.content]);

                        return (
                            <Box sx={{ height: '70vh', mt: 2 }}>
                                <Calendar
                                    localizer={localizer}
                                    events={events}
                                    startAccessor="start"
                                    endAccessor="end"
                                    date={currentDate}
                                    onNavigate={handleNavigate}
                                    defaultView="month"
                                    views={['month', 'week', 'day']}
                                    style={{ height: '100%' }}
                                />
                            </Box>
                        );
                    }

                    // Handle binary content
                    if (artifact.type === 'binary' || artifact.metadata?.format === 'binary') {
                        return <pre>Binary content</pre>;
                    }
                    
                    // Default to Markdown rendering
                    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content as string}</ReactMarkdown>;
                })()}
            </div>
        </Box>
    );
};
