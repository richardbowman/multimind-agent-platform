import React, { useState, Fragment } from 'react';
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
    Typography
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
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>LLM Request Details</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="subtitle1" gutterBottom>Input</Typography>
                    <FormattedDataView data={selectedLog?.input} />
                    
                    <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>Output</Typography>
                    <FormattedDataView data={selectedLog?.output} />
                    
                    {selectedLog?.error && (
                        <>
                            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>Error</Typography>
                            <div className="error-details">
                                <div>{typeof selectedLog.error === 'string' ? selectedLog.error : selectedLog.error.message || 'Unknown error'}</div>
                                {selectedLog.error.stack && (
                                    <pre style={{ 
                                        margin: 0,
                                        whiteSpace: 'pre-wrap',
                                        wordWrap: 'break-word',
                                        maxWidth: '100%',
                                        maxHeight: '400px',
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
                                            {selectedLog.error.stack}
                                        </code>
                                    </pre>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDetails}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
