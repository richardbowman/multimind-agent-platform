import React, { useEffect, useState, useCallback, useRef } from 'react';
import { LLMLogViewer } from './LLMLogViewer';
import { 
    Collapse, 
    List, 
    ListItem, 
    ListItemText, 
    ListItemButton, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Paper 
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { useDataContext } from '../contexts/DataContext';
import DOMPurify from 'dompurify';
import { 
    AppBar, 
    Toolbar, 
    Tabs, 
    Tab, 
    TextField, 
    Box, 
    styled, 
    FormControlLabel, 
    Switch,
    ToggleButtonGroup,
    ToggleButton,
    IconButton
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useLogger } from '../contexts/LogContext';

interface LogViewerProps {
    logType: 'llm' | 'system';
}

interface FormattedDataViewProps {
    data: any;
}

const FormattedDataView: React.FC<FormattedDataViewProps> = ({ data }) => {
    if (typeof data === 'string') {
        // Format string with preserved newlines
        return (
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
                    maxHeight: 400,
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
                {JSON.stringify(data, null, 2)}
            </code>
        </pre>
    );
};

export const LogViewer: React.FC<LogViewerProps> = ({ logType: initialLogType }) => {
    const pageSize = 50;
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system'>(initialLogType);
    const { logs, fetchLogs } = useDataContext();
    const logger = useLogger();
    const [filterText, setFilterText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showVerbose, setShowVerbose] = useState(false);
    const [verboseToggleTimestamp, setVerboseToggleTimestamp] = useState(Date.now());
    const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'debug' | 'verbose'>('all');

    const currentLogTypeRef = useRef(currentLogTab);
    
    const previousLogsRef = useRef<string>('');
    
    const refreshLogs = useCallback(async () => {
        try {
            // Fetch logs with newest first
            const result = await fetchLogs(currentLogTypeRef.current, {
                sort: 'desc',
                limit: pageSize,
                forceRefresh: true
            });
            
            // Compare with previous logs
            const currentLogsString = JSON.stringify(result);
            if (currentLogsString !== previousLogsRef.current) {
                setIsLoading(true);
                previousLogsRef.current = currentLogsString;
                setLoadedLogs([]);
                setHasMore(true);
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Error refreshing logs:', error);
            setIsLoading(false);
        }
    }, [fetchLogs, pageSize]);

    useEffect(() => {
        currentLogTypeRef.current = currentLogTab;
        logger.verbose('LogViewer: Setting up log subscription for type:', currentLogTab);
        
        // Initial fetch
        refreshLogs();

        // Set up polling interval for updates
        // const pollInterval = setInterval(() => {
        //     refreshLogs();
        // }, 5000); // Poll every 5 seconds

        return () => {
            logger.verbose('LogViewer: Cleaning up log subscription for type:', currentLogTab);
            // clearInterval(pollInterval);
        };
    }, [currentLogTab, refreshLogs, logger]);

    const filterLog = (content: string) => {
        if (!filterText) return true;
        return content.toLowerCase().includes(filterText.toLowerCase());
    };

    const highlightText = (text: string) => {
        if (!filterText) return text;
        
        const sanitizedText = DOMPurify.sanitize(text);
        // Escape special regex characters in filterText
        const escapedFilter = filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedFilter})`, 'gi');
        return sanitizedText.replace(regex, '<mark>$1</mark>');
    };

    const [loadedLogs, setLoadedLogs] = useState<any[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const loadMoreLogs = useCallback(async () => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            let newLogs;
            if (currentLogTab === 'llm') {
                // LLM logs are already loaded in full
                setHasMore(false);
                return;
            } else {
                newLogs = await fetchLogs(currentLogTab, {
                    limit: pageSize,
                    offset: loadedLogs.length,
                    filter: {
                        search: filterText,
                        showVerbose: showVerbose
                    }
                });
                
                setLoadedLogs(prev => [...prev, ...newLogs.logs]);
                setHasMore(newLogs.total > loadedLogs.length + newLogs.logs.length);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setIsLoadingMore(false);
        }
    }, [currentLogTab, filterText, fetchLogs, loadedLogs.length, showVerbose]);

    // Set up intersection observer for infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    loadMoreLogs();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, loadMoreLogs]);

    useEffect(() => {
        // Reset loaded logs when log type, filter, or verbose toggle changes
        setLoadedLogs([]);
        setHasMore(true);
        
        if (currentLogTab === 'llm') {
            // LLM logs are already loaded in full
            setHasMore(false);
        } else {
            loadMoreLogs();
        }
    }, [currentLogTab, filterText, verboseToggleTimestamp]);

    // Track open/closed state for LLM log entries
    const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});
    
    const toggleEntry = (id: string) => {
        setOpenEntries(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const renderLogs = () => {
        switch (currentLogTab) {
            case 'llm':

                return <LLMLogViewer 
                    logs={logs}
                    filterText={filterText}
                    highlightText={highlightText}
                />;
            
            case 'system':
                return [...(logs?.system?.logs || [])]
                    .filter(log => {
                    const levelMatch = logLevelFilter === 'all' || 
                                     log.level.toLowerCase() === logLevelFilter;
                    
                    return filterLog(log.message) && 
                           levelMatch && 
                           (showVerbose || log.level.toLowerCase() !== 'verbose');
                }).map((log, index) => (
                    <div key={index} className={`log-entry ${log.level?.toLowerCase()}`}>
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">{log.level}</span>
                        <span className="log-message" dangerouslySetInnerHTML={{ __html: highlightText(log.message) }} />
                    </div>
                )) || [];
            }
    };

    const LogToolbar = styled(Toolbar)(({ theme }) => ({
        backgroundColor: theme.palette.background.default,
        borderBottom: '1px solid #444',
        padding: theme.spacing(1),
    }));

    return (
        <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="relative" sx={{ zIndex: 1 }}>
                <LogToolbar>
                    <Tabs value={currentLogTab} onChange={(_, newValue) => setCurrentLogTab(newValue)}>
                        <Tab label="System Logs" value="system" />
                        <Tab label="LLM Logs" value="llm" />
                    </Tabs>
                    <Box sx={{ flexGrow: 1 }} />
                    {currentLogTab === 'system' && (
                        <ToggleButtonGroup
                            value={logLevelFilter}
                            exclusive
                            onChange={(_, newFilter) => setLogLevelFilter(newFilter)}
                            size="small"
                            sx={{ mr: 2 }}
                        >
                            <ToggleButton value="all">All</ToggleButton>
                            <ToggleButton value="error">Error</ToggleButton>
                            <ToggleButton value="warn">Warn</ToggleButton>
                            <ToggleButton value="info">Info</ToggleButton>
                            <ToggleButton value="debug">Debug</ToggleButton>
                            <ToggleButton value="verbose">Verbose</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                    <TextField
                        variant="outlined"
                        placeholder="Filter logs..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        sx={{ width: 300 }}
                        autoFocus
                        inputProps={{
                            autoFocus: true
                        }}
                    />
                    <IconButton 
                        onClick={refreshLogs}
                        disabled={isLoading}
                        sx={{ ml: 2 }}
                        title="Refresh logs"
                    >
                        <RefreshIcon />
                    </IconButton>
                    {isLoading && <Box sx={{ ml: 1, color: '#999' }}>Loading...</Box>}
                </LogToolbar>
            </AppBar>
            <Box 
                sx={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    '& .log-entry': {
                        borderBottom: '1px solid #eee',
                        padding: '8px 0',
                        '& .log-timestamp': {
                            color: '#666',
                            marginRight: '16px',
                            fontSize: '0.875rem'
                        },
                        '& .log-level': {
                            fontWeight: 'bold',
                            marginRight: '16px',
                            textTransform: 'uppercase',
                            fontSize: '0.875rem'
                        },
                        '& .log-method': {
                            fontWeight: '500',
                            color: theme => theme.palette.primary.main
                        },
                        '& .MuiListItemText-secondary': {
                            color: theme => theme.palette.text.secondary,
                            fontSize: '0.875rem'
                        },
                        '& .error-details': {
                            color: theme => theme.palette.error.main,
                            marginTop: '8px'
                        },
                        '& pre': {
                            backgroundColor: 'background.paper',
                            padding: '8px',
                            borderRadius: '4px',
                            margin: '8px 0 0 0',
                            maxWidth: '100%',
                            overflowX: 'auto',
                            color: 'text.primary'
                        }
                    }
                }}
            >
                {renderLogs()}
                {hasMore && (
                    <Box 
                        ref={loadMoreRef}
                        sx={{ 
                            height: '20px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            py: 2
                        }}
                    >
                        <Box sx={{ color: '#666' }}>Loading more...</Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
