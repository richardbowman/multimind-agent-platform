import React, { useEffect, useState, useCallback, useRef } from 'react';
import { LLMLogViewer } from './LLMLogViewer';
import { useDataContext } from '../contexts/DataContext';
import DOMPurify from 'dompurify';
import {
    AppBar,
    Toolbar,
    Tabs,
    Tab,
    TextField,
    Box,
    styled, ToggleButtonGroup,
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
    const { logs, fetchLogs } = useDataContext();
    const logger = useLogger();
    const [filterText, setFilterText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showVerbose, setShowVerbose] = useState(false);
    const [verboseToggleTimestamp, setVerboseToggleTimestamp] = useState(Date.now());
    const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'debug' | 'verbose'>('error');

    const currentLogTypeRef = useRef(currentLogTab);

    const lastLogTimestampRef = useRef<number>(0);

    const refreshLogs = useCallback(async () => {
        try {
            // Fetch logs with newest first
            const result = await fetchLogs(currentLogTypeRef.current, {
                limit: pageSize
            });
        } catch (error) {
            console.error('Error refreshing logs:', error);
            setIsLoading(false);
        }
    }, [fetchLogs, pageSize]);

    useEffect(() => {
        // Check if we have new logs by comparing the latest timestamp
        if (logs?.system?.logs?.length > 0) {
            const latestTimestamp = logs.system.logs[0].timestamp;
            if (latestTimestamp && latestTimestamp > lastLogTimestampRef.current) {
                lastLogTimestampRef.current = latestTimestamp;
                setIsLoading(true);
                setLoadedLogs(prev => {
                    // Only update if we have new logs
                    const newLogs = logs.system.logs.filter(newLog =>
                        !prev.some(existingLog => existingLog.timestamp === newLog.timestamp)
                    );
                    return newLogs.length > 0 ? [...newLogs, ...prev] : prev;
                });
                setHasMore(logs.system.total > logs.system.logs.length);
                setIsLoading(false);
            }
        }
    }, [logs]);

    useEffect(() => {
        currentLogTypeRef.current = currentLogTab;
        logger.verbose(`LogViewer: Setting up log subscription for type: ${currentLogTypeRef.current}`);

        // Initial fetch
        refreshLogs();

        // Set up polling interval for updates
        // const pollInterval = setInterval(() => {
        //     refreshLogs();
        // }, 10000); // Poll every 10 seconds

        // return () => {
        //     logger.verbose('LogViewer: Cleaning up log subscription for type:', currentLogTab);
        //     clearInterval(pollInterval);
        // };
    }, [currentLogTab, logger]); // Remove refreshLogs from dependencies

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
                        search: filterText
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
        // Only reset logs if log type changes
        if (currentLogTab === 'llm') {
            // LLM logs are already loaded in full
            setLoadedLogs([]);
            setHasMore(false);
        } else {
            setLoadedLogs([]);
            setHasMore(true);
            loadMoreLogs();
        }
    }, [currentLogTab]); // Remove filterText and verboseToggleTimestamp from dependencies

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
                    filterLog={filterLog}
                />;

            case 'system':
                return [...(logs?.system?.logs || [])]
                    .filter(log => {
                        const levelMatch = logLevelFilter === 'all' ||
                            log.level.toLowerCase() === logLevelFilter;

                        return filterLog(log.message) &&
                            levelMatch &&
                            (showVerbose || log.level.toLowerCase() !== 'verbose');
                    }).map((log) => {
                        // Create a more unique key using timestamp and message hash
                        const logKey = `${log.timestamp}-${log.message.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)}`;
                        return (
                            <Box
                                key={logKey}
                                className={`log-entry ${log.level?.toLowerCase()}`}
                                sx={{
                                    borderBottom: 1,
                                    borderColor: 'divider',
                                    py: 1,
                                    '& .log-timestamp': {
                                        color: 'text.secondary',
                                        mr: 2,
                                        fontSize: '0.875rem'
                                    },
                                    '& .log-level': {
                                        fontWeight: 'bold',
                                        mr: 2,
                                        textTransform: 'uppercase',
                                        fontSize: '0.875rem',
                                        color: log.level?.toLowerCase() === 'error' ? 'error.main' :
                                            log.level?.toLowerCase() === 'warn' ? 'warning.main' :
                                                'text.secondary'
                                    },
                                    '& .log-message': {
                                        color: 'text.primary'
                                    }
                                }}
                            >
                                <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                                <span className="log-level">{log.level}</span>
                                <span className="log-message" dangerouslySetInnerHTML={{ __html: highlightText(log.message) }} />
                            </Box>
                        );
                    });
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
