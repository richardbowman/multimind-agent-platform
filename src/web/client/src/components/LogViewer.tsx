import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../contexts/DataContext';
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

export const LogViewer: React.FC<LogViewerProps> = ({ logType: initialLogType }) => {
    const pageSize = 50;
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system'>(initialLogType);
    const { logs, fetchLogs } = useWebSocket();
    const logger = useLogger();
    const [filterText, setFilterText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showVerbose, setShowVerbose] = useState(false);
    const [verboseToggleTimestamp, setVerboseToggleTimestamp] = useState(Date.now());
    const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'debug' | 'verbose'>('all');

    const refreshLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch logs with newest first
            await fetchLogs(currentLogTab, {
                sort: 'desc',
                limit: pageSize
            });
            // Reset loaded logs since we're getting fresh data
            setLoadedLogs([]);
            setHasMore(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentLogTab, fetchLogs, pageSize]);

    useEffect(() => {
        logger.verbose('LogViewer: Setting up log subscription for type:', currentLogTab);
        
        // Initial fetch
        refreshLogs();

        // Set up event listener for log updates
        const handleLogUpdate = () => {
            refreshLogs();
        };

        return () => {
            logger.verbose('LogViewer: Cleaning up log subscription for type:', currentLogTab);
            // No need to explicitly unsubscribe since RPC handles cleanup
        };
    }, [currentLogTab, refreshLogs]);

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

    const loadMoreLogs = useCallback(async () => {
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
        }
    }, [currentLogTab, filterText, fetchLogs, loadedLogs.length, showVerbose]);

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

    const renderLogs = () => {
        switch (currentLogTab) {
            case 'llm':
                return Object.entries(logs.llm || {}).flatMap(([service, entries]) => 
                    (Array.isArray(entries) ? entries : [])
                        .filter(log => 
                            filterLog(JSON.stringify({
                                method: log?.method,
                                input: log?.input,
                                output: log?.output,
                                error: log?.error
                            }))
                        )
                        .map((log, index) => (
                        <div key={`${service}-${index}`} className="log-entry info">
                            <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className="log-level">{service.toUpperCase()}</span>
                            <span className="log-message">
                                Method: <span dangerouslySetInnerHTML={{ __html: highlightText(log.method) }} /><br/>
                                Input: <span dangerouslySetInnerHTML={{ __html: highlightText(JSON.stringify(log.input, null, 2)) }} /><br/>
                                Output: <span dangerouslySetInnerHTML={{ __html: highlightText(JSON.stringify(log.output, null, 2)) }} />
                                {log.error && (
                                    <div className="error-details">
                                        <div>Error: {typeof log.error === 'string' ? log.error : log.error.message || 'Unknown error'}</div>
                                        {log.error.stack && (
                                            <pre>{log.error.stack}</pre>
                                        )}
                                    </div>
                                )}
                            </span>
                        </div>
                    ))
                );
            
            case 'system':
                return logs.system?.logs
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
                    flexDirection: 'column'
                }}
            >
                {renderLogs()}
                {hasMore && (
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        py: 2
                    }}>
                        <button 
                            onClick={loadMoreLogs}
                            style={{ 
                                padding: '8px 16px',
                                backgroundColor: '#1976d2',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                            }}
                        >
                            Load More
                        </button>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
