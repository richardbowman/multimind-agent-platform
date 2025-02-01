import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
    ListItem, 
    ListItemText, 
    ListItemButton,
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Tabs,
    Tab,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useDataContext } from '../contexts/DataContext';

interface FormattedDataViewProps {
    data: any;
}

export const FormattedDataView: React.FC<FormattedDataViewProps> = ({ data }) => {
    if (typeof data === 'string') {
        // Format string with preserved newlines
        return (
            <pre style={{ 
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                maxWidth: '100%',
                overflow: 'auto',
                backgroundColor: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd'
            }}>
                <code style={{
                    color: '#333',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                }}>
                    {data}
                </code>
            </pre>
        );
    } else if (typeof data === 'object' && data !== null) {
        // Convert object to table
        return (
            <TableContainer 
                component={Paper} 
                sx={{ 
                    overflow: 'auto',
                    backgroundColor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ 
                                fontWeight: 'bold',
                                backgroundColor: 'background.default',
                                color: 'text.primary'
                            }}>
                                Key
                            </TableCell>
                            <TableCell sx={{ 
                                fontWeight: 'bold',
                                backgroundColor: 'background.default',
                                color: 'text.primary'
                            }}>
                                Value
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {Object.entries(data).map(([key, value]) => (
                            <TableRow key={key}>
                                <TableCell sx={{ 
                                    fontWeight: 500,
                                    color: 'text.primary',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {key}
                                </TableCell>
                                <TableCell sx={{ 
                                    color: 'text.primary',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {typeof value === 'object' ? (
                                        <FormattedDataView data={value} />
                                    ) : (
                                        <span style={{ whiteSpace: 'pre-wrap' }}>
                                            {String(value)}
                                        </span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    }
    
    // Fallback for other types
    return (
        <pre style={{ 
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            maxWidth: '100%',
            overflow: 'auto',
            backgroundColor: '#f5f5f5',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ddd'
        }}>
            <code style={{
                color: '#333',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
            }}>
                {JSON.stringify(data, null, 2)}
            </code>
        </pre>
    );
};

interface LLMLogViewerProps {
    logs: any;
    filterText: string;
    highlightText: (text: string) => string;
    filterLog: (content: string) => boolean;
}

export const LLMLogViewer: React.FC<LLMLogViewerProps> = ({ logs, filterText, highlightText, filterLog }) => {
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [selectedLogIndex, setSelectedLogIndex] = useState<number>(-1);
    const [tabValue, setTabValue] = useState(0);
    const [allLogs, setAllLogs] = useState<any[]>([]);

    const handleOpenDetails = (log: any, index: number) => {
        const logsArray = Object.entries(logs?.llm || {})
            .flatMap(([_, entries]) => Array.isArray(entries) ? [...entries].reverse() : [])
            .filter(log => filterLog(JSON.stringify({
                method: log?.method,
                input: log?.input,
                output: log?.output,
                error: log?.error
            })));
            
        setAllLogs(logsArray);
        setSelectedLog(log);
        setSelectedLogIndex(logsArray.indexOf(log));
    };

    const handleNavigate = (direction: 'prev' | 'next') => {
        const newIndex = direction === 'prev' ? selectedLogIndex - 1 : selectedLogIndex + 1;
        if (newIndex >= 0 && newIndex < allLogs.length) {
            setSelectedLog(allLogs[newIndex]);
            setSelectedLogIndex(newIndex);
        }
    };

    const handleCloseDetails = () => {
        setSelectedLog(null);
    };

    return (
        <Box>
            {Object.entries(logs?.llm || {})
                .flatMap(([service, entries]) => 
                    (Array.isArray(entries) ? [...entries] : [])
                        .filter(log => 
                            filterLog(JSON.stringify({
                                method: log?.method,
                                input: log?.input,
                                output: log?.output,
                                error: log?.error
                            }))
                        )
                )
                .sort((a, b) => b.timestamp - a.timestamp) // Sort by timestamp descending
                .map((log, index) => {
                        return (
                            <div key={`${service}-${index}`} className="log-entry info">
                                <ListItemButton onClick={() => handleOpenDetails(log, index)} sx={{ p: 0 }}>
                                    <ListItemText
                                        primary={
                                            <>
                                                <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                                                <span className="log-level">{service.toUpperCase()}</span>
                                                <span className="log-method" dangerouslySetInnerHTML={{ __html: highlightText(log.method) }} />
                                            </>
                                        }
                                        secondary={log.error ? 'Error occurred' : 'Success'}
                                        sx={{ my: 0 }}
                                    />
                                </ListItemButton>
                            </div>
                        );
                    })
            )}
            
            <Dialog 
                open={!!selectedLog} 
                onClose={handleCloseDetails}
                maxWidth={false}
                fullWidth
                sx={{
                    '& .MuiDialog-paper': {
                        width: '95vw',
                        maxWidth: 'none',
                        height: '95vh'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                        <IconButton 
                            onClick={() => handleNavigate('prev')} 
                            disabled={selectedLogIndex <= 0}
                            sx={{ mr: 1 }}
                        >
                            <ArrowBackIosIcon />
                        </IconButton>
                        <IconButton 
                            onClick={() => handleNavigate('next')} 
                            disabled={selectedLogIndex >= allLogs.length - 1}
                            sx={{ ml: 1 }}
                        >
                            <ArrowForwardIosIcon />
                        </IconButton>
                    </Box>
                    <Typography variant="h6" component="span">
                        LLM Request Details ({selectedLogIndex + 1}/{allLogs.length})
                    </Typography>
                    <Box /> {/* Spacer to balance the layout */}
                </DialogTitle>
                <DialogContent dividers sx={{
                    overflow: 'hidden',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Tabs 
                        value={tabValue} 
                        onChange={(_, newValue) => setTabValue(newValue)}
                        sx={{ mb: 2 }}
                    >
                        <Tab label="Input" />
                        <Tab label="Output" />
                        {selectedLog?.error && <Tab label="Error" />}
                    </Tabs>
                    
                    {tabValue === 0 && (
                        <Box sx={{ 
                            p: 2,
                            backgroundColor: 'background.paper',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: 'divider',
                            overflow: 'auto',
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {selectedLog?.input && typeof selectedLog.input === 'object' ? (
                                Object.entries(selectedLog.input).map(([key, value]) => (
                                    <Box key={key} sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                                            {key}
                                        </Typography>
                                        <FormattedDataView data={value} />
                                    </Box>
                                ))
                            ) : (
                                <Typography variant="body2" color="textSecondary">
                                    No input available
                                </Typography>
                            )}
                        </Box>
                    )}
                    
                    {tabValue === 1 && (
                        <Box sx={{ 
                            p: 2,
                            backgroundColor: 'background.paper',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: 'divider',
                            overflow: 'hidden',
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {selectedLog?.output && typeof selectedLog.output === 'object' ? (
                                Object.entries(selectedLog.output).map(([key, value]) => (
                                    <Box key={key} sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                                            {key}
                                        </Typography>
                                        {key === 'message' ? (
                                            <ReactMarkdown>
                                                {value as string}
                                            </ReactMarkdown>
                                        ) : (
                                            <FormattedDataView data={value} />
                                        )}
                                    </Box>
                                ))
                            ) : (
                                <Typography variant="body2" color="textSecondary">
                                    No output available
                                </Typography>
                            )}
                        </Box>
                    )}
                    
                    {tabValue === 2 && selectedLog?.error && (
                        <Box sx={{ 
                            p: 2,
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            overflow: 'auto'
                        }}>
                            <div>{typeof selectedLog.error === 'string' ? selectedLog.error : selectedLog.error.message || 'Unknown error'}</div>
                            {selectedLog.error.stack && (
                                <pre style={{ 
                                    margin: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordWrap: 'break-word',
                                    maxWidth: '100%',
                                    overflow: 'auto',
                                    color: '#333',
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem'
                                }}>
                                    {selectedLog.error.stack}
                                </pre>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDetails}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
