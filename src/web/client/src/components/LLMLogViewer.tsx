import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
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
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { LLMLogEntry } from '../../../../llm/LLMLogModel';
import { useLLMLogs } from '../contexts/LLMLogContext';

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

// Helper functions to extract meaningful messages
const getLastMessage = (input: any): string => {
    if (!input) return '';

    if (Array.isArray(input)) {
        const lastMessage = input[input.length - 1];
        return lastMessage?.content || JSON.stringify(lastMessage);
    }

    if (typeof input === 'object') {
        return input?.content || input?.message || JSON.stringify(input);
    }

    return input.toString();
};

const getOutputMessage = (output: any): string => {
    if (!output) return '';

    if (typeof output === 'object') {
        return output?.message || output?.content || JSON.stringify(output);
    }

    return output.toString();
};

const columns: GridColDef[] = [
    { 
        field: 'timestamp',
        headerName: 'Timestamp',
        width: 180,
        valueFormatter: (value) => value ? new Date(value).toLocaleString() : ''
    },
    {
        field: 'input',
        headerName: 'Input',
        width: 300,
        valueFormatter: (value) => 
            getLastMessage(value?.messages || value?.prompt || value)
    },
    {
        field: 'output',
        headerName: 'Output',
        width: 300,
        valueFormatter: (value) => 
            getOutputMessage(value)
    },
    {
        field: 'error',
        headerName: 'Status',
        width: 120,
        valueFormatter: (value) => value ? 'ERROR' : 'SUCCESS',
        cellClassName: (params) => 
            params.value === 'ERROR' ? 'error-cell' : 'success-cell'
    },
    {
        field: 'agentName',
        headerName: 'Agent',
        width: 150,
        valueFormatter: (value) => value || 'N/A'
    },
    {
        field: 'provider',
        headerName: 'Provider',
        width: 150,
        valueFormatter: (value) => value || 'N/A'
    },
    {
        field: 'stepType',
        headerName: 'Step Type',
        width: 150,
        valueFormatter: (value) => value || 'N/A'
    },
    {
        field: 'taskId',
        headerName: 'Task',
        width: 200,
        valueFormatter: (value) => value ? `Task: ${value}` : 'N/A'
    }
];

const transformLogs = (logs: LLMLogEntry[]) => {
    return logs.map(log => ({
        ...log,
        agentName: log.context?.agentName || 'N/A',
        provider: log.context?.provider || 'N/A',
        stepType: log.context?.stepType || 'N/A',
        taskId: log.context?.taskId || 'N/A'
    }));
};

export const LLMLogViewer: React.FC<LLMLogViewerProps> = ({ filterText, highlightText, filterLog }) => {
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [selectedLogIndex, setSelectedLogIndex] = useState<number>(-1);
    const [tabValue, setTabValue] = useState(0);
    const [allLogs, setAllLogs] = useState<LLMLogEntry[]>([]);
    const { logs, hasMore, loadMoreLogs, refreshLogs, isLoading } = useLLMLogs();

    // Load initial logs when component mounts
    React.useEffect(() => {
        refreshLogs();
    }, [refreshLogs]);

    const handleOpenDetails = React.useCallback((log: LLMLogEntry) => {
        setSelectedLog(log);
        setSelectedLogIndex(logs.findIndex(l => l.timestamp === log.timestamp));
    }, [logs]);

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
        <Box sx={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
            <Box sx={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
                <DataGrid
                    rows={transformLogs(logs)}
                    columns={columns}
                    onRowClick={(params) => handleOpenDetails(params.row, params.row.id)}
                    loading={isLoading}
                    getRowId={(row) => row.timestamp + row.service}
                    sx={{
                        '& .MuiDataGrid-cell': {
                            cursor: 'pointer',
                        },
                        '& .MuiDataGrid-row:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        },
                    }}
                />
            </Box>

            {hasMore && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <Button
                        variant="outlined"
                        onClick={loadMoreLogs}
                        disabled={!hasMore}
                    >
                        Load More
                    </Button>
                </Box>
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
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                                    Context
                                </Typography>
                                <FormattedDataView data={{
                                    traceId: selectedLog?.context?.traceId || 'N/A',
                                    agent: selectedLog?.context?.agentName || 'N/A',
                                    stepType: selectedLog?.context?.stepType || 'N/A',
                                    taskId: selectedLog?.context?.taskId || 'N/A',
                                    projectId: selectedLog?.context?.projectId || 'N/A',
                                    goal: selectedLog?.context?.goal || 'N/A',
                                    stepGoal: selectedLog?.context?.stepGoal || 'N/A'
                                }} />
                            </Box>
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
                            overflow: 'auto',
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
                                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : (value as Object).toString()}
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
