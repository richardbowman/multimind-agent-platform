import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import DOMPurify from 'dompurify';
import './LogViewer.css';

interface LogViewerProps {
    logType: 'llm' | 'system' | 'api';
}

export const LogViewer: React.FC<LogViewerProps> = ({ logType }) => {
    const { logs, fetchLogs } = useWebSocket();
    const [filterText, setFilterText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lastFetch, setLastFetch] = useState(0);

    const refreshLogs = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (isLoading) return;
        
        // Only fetch if more than 5 seconds have passed since last fetch
        const now = Date.now();
        if (now - lastFetch < 5000) return;
        
        setIsLoading(true);
        try {
            await fetchLogs(logType);
            setLastFetch(now);
        } finally {
            setIsLoading(false);
        }
    }, [logType, fetchLogs, isLoading, lastFetch]);

    useEffect(() => {
        console.log('LogViewer: Setting up log subscription for type:', logType);
        // Reset lastFetch to 0 when logType changes to force immediate refresh
        setLastFetch(0);
        refreshLogs();

        // Set up periodic refresh every 5 seconds
        const intervalId = setInterval(refreshLogs, 5000);

        return () => {
            console.log('LogViewer: Cleaning up log subscription for type:', logType);
            clearInterval(intervalId);
        };
    }, [logType]); // Remove refreshLogs from dependencies to prevent recreation on lastFetch changes

    const filterLog = (content: string) => {
        if (!filterText) return true;
        return content.toLowerCase().includes(filterText.toLowerCase());
    };

    const highlightText = (text: string) => {
        if (!filterText) return text;
        
        const sanitizedText = DOMPurify.sanitize(text);
        const regex = new RegExp(`(${filterText})`, 'gi');
        return sanitizedText.replace(regex, '<mark>$1</mark>');
    };

    const renderLogs = () => {
        switch (logType) {
            case 'llm':
                return Object.entries(logs.llm).flatMap(([service, entries]) => 
                    entries.filter(log => 
                        filterLog(JSON.stringify({
                            method: log.method,
                            input: log.input,
                            output: log.output,
                            error: log.error
                        }))
                    ).map((log, index) => (
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
                return logs.system.filter(log => 
                    filterLog(log.message)
                ).map((log, index) => (
                    <div key={index} className={`log-entry ${log.level.toLowerCase()}`}>
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">{log.level}</span>
                        <span className="log-message" dangerouslySetInnerHTML={{ __html: highlightText(log.message) }} />
                    </div>
                ));
            
            case 'api':
                return logs.api.filter(log =>
                    filterLog(JSON.stringify(log))
                ).map((log, index) => (
                    <div key={index} className="log-entry info">
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">API</span>
                        <span className="log-message" dangerouslySetInnerHTML={{ __html: highlightText(JSON.stringify(log, null, 2)) }} />
                    </div>
                ));
        }
    };

    return (
        <div className="log-viewer">
            <div className="filter-bar">
                <input
                    type="text"
                    placeholder="Filter logs..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="log-filter"
                />
                {isLoading && <span className="loading-indicator">Loading...</span>}
            </div>
            <div className="log-content">
                {renderLogs()}
            </div>
        </div>
    );
};
