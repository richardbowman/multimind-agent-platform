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
    Tab
} from '@mui/material';
import { useDataContext } from '../contexts/DataContext';
import { FormattedDataView } from './LogViewer';

interface LLMLogViewerProps {
    logs: any;
    filterText: string;
    highlightText: (text: string) => string;
    filterLog: (content: string) => boolean;
}

export const LLMLogViewer: React.FC<LLMLogViewerProps> = ({ logs, filterText, highlightText, filterLog }) => {
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [tabValue, setTabValue] = useState(0);

    const handleOpenDetails = (log: any) => {
        setSelectedLog(log);
    };

    const handleCloseDetails = () => {
        setSelectedLog(null);
    };

    return (
        <Box>
            {Object.entries(logs?.llm || {}).flatMap(([service, entries]) => 
                (Array.isArray(entries) ? [...entries].reverse() : [])
                    .filter(log => 
                        filterLog(JSON.stringify({
                            method: log?.method,
                            input: log?.input,
                            output: log?.output,
                            error: log?.error
                        }))
                    )
                    .map((log, index) => {
                        return (
                            <div key={`${service}-${index}`} className="log-entry info">
                                <ListItemButton onClick={() => handleOpenDetails(log)} sx={{ p: 0 }}>
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
                <DialogTitle>LLM Request Details</DialogTitle>
                <DialogContent dividers>
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
                            maxHeight: '400px',
                            overflow: 'auto'
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
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            maxHeight: '400px',
                            overflow: 'auto'
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
                            maxHeight: '400px',
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
