import React, { useState, Fragment } from 'react';
import { 
    Collapse, 
    List, 
    ListItem, 
    ListItemText, 
    ListItemButton,
    Box
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { useDataContext } from '../contexts/DataContext';
import { FormattedDataView } from './LogViewer';

interface LLMLogViewerProps {
    logs: any;
    filterText: string;
    highlightText: (text: string) => string;
    filterLog: (content: string) => boolean;
}

export const LLMLogViewer: React.FC<LLMLogViewerProps> = ({ logs, filterText, highlightText, filterLog }) => {
    const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});
    
    const toggleEntry = (id: string) => {
        setOpenEntries(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
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
                        const entryId = `${service}-${index}`;
                        const isOpen = openEntries[entryId] || false;

                        return (
                            <div key={entryId} className="log-entry info">
                                <ListItemButton onClick={() => toggleEntry(entryId)} sx={{ p: 0 }}>
                                    <ListItemText
                                        primary={
                                            <Fragment>
                                                <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                                                <span className="log-level">{service.toUpperCase()}</span>
                                                <span className="log-method" dangerouslySetInnerHTML={{ __html: highlightText(log.method) }} />
                                            </Fragment>
                                        }
                                        secondary={log.error ? 'Error occurred' : 'Success'}
                                        sx={{ my: 0 }}
                                    />
                                    {isOpen ? <ExpandLess /> : <ExpandMore />}
                                </ListItemButton>
                                
                                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                    <List component="div" disablePadding>
                                        <ListItem sx={{ pl: 4, pt: 0 }}>
                                            <ListItemText
                                                primary="Input"
                                                secondary={
                                                    <FormattedDataView data={log.input} />
                                                }
                                            />
                                        </ListItem>
                                        <ListItem sx={{ pl: 4, pt: 0 }}>
                                            <ListItemText
                                                primary="Output"
                                                secondary={
                                                    <FormattedDataView data={log.output} />
                                                }
                                            />
                                        </ListItem>
                                        {log.error && (
                                            <ListItem sx={{ pl: 4, pt: 0 }}>
                                                <ListItemText
                                                    primary="Error"
                                                    secondary={
                                                        <div className="error-details">
                                                            <div>{typeof log.error === 'string' ? log.error : log.error.message || 'Unknown error'}</div>
                                                            {log.error.stack && (
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
                                                                        {log.error.stack}
                                                                    </code>
                                                                </pre>
                                                            )}
                                                        </div>
                                                    }
                                                />
                                            </ListItem>
                                        )}
                                    </List>
                                </Collapse>
                            </div>
                        );
                    })
            )}
        </Box>
    );
};
