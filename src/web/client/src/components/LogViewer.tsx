import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface LogViewerProps {
    logType: 'llm' | 'system' | 'api';
}

export const LogViewer: React.FC<LogViewerProps> = ({ logType }) => {
    const { logs, fetchLogs } = useWebSocket();
    const [filterText, setFilterText] = useState('');

    useEffect(() => {
        console.log('LogViewer: Setting up log subscription for type:', logType);
        
        // Initial fetch
        fetchLogs(logType);

        // No need for subscription as the WebSocket context will handle updates
        return () => {
            console.log('LogViewer: Cleaning up log subscription for type:', logType);
        };
    }, [logType, fetchLogs]);

    const filterLog = (content: string) => {
        if (!filterText) return true;
        return content.toLowerCase().includes(filterText.toLowerCase());
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
                                Method: {log.method}<br/>
                                Input: {JSON.stringify(log.input, null, 2)}<br/>
                                Output: {JSON.stringify(log.output, null, 2)}
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
                        <span className="log-message">{log.message}</span>
                    </div>
                ));
            
            case 'api':
                return logs.api.filter(log =>
                    filterLog(JSON.stringify(log))
                ).map((log, index) => (
                    <div key={index} className="log-entry info">
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">API</span>
                        <span className="log-message">{JSON.stringify(log, null, 2)}</span>
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
            </div>
            <div className="log-content">
                {renderLogs()}
            </div>
        </div>
    );
};
