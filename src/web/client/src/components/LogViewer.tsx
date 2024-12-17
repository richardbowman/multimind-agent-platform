import React, { useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface LogViewerProps {
    logType: 'llm' | 'system' | 'api';
}

export const LogViewer: React.FC<LogViewerProps> = ({ logType }) => {
    const { logs, fetchLogs } = useWebSocket();

    useEffect(() => {
        console.log('LogViewer: Setting up log fetching for type:', logType);
        let isSubscribed = true;

        const fetchLogsIfVisible = () => {
            if (isSubscribed && document.visibilityState === 'visible') {
                console.log('LogViewer: Polling logs for type:', logType);
                fetchLogs(logType);
            }
        };

        // Initial fetch
        fetchLogsIfVisible();

        // Set up polling interval
        const interval = setInterval(fetchLogsIfVisible, 5000);

        // Clean up function
        return () => {
            console.log('LogViewer: Cleaning up log fetching for type:', logType);
            isSubscribed = false;
            clearInterval(interval);
        };
    }, [logType]); // Remove fetchLogs from dependencies

    const renderLogs = () => {
        switch (logType) {
            case 'llm':
                return Object.entries(logs.llm).map(([service, entries]) => 
                    entries.map((log, index) => (
                        <div key={`${service}-${index}`} className="log-entry info">
                            <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className="log-level">{service.toUpperCase()}</span>
                            <span className="log-message">
                                Method: {log.method}<br/>
                                Input: {JSON.stringify(log.input, null, 2)}<br/>
                                Output: {JSON.stringify(log.output, null, 2)}
                                {log.error && (
                                    <div className="error-details">
                                        <div>Error: {log.error.message}</div>
                                        {log.error.stack && (
                                            <pre>{log.error.stack}</pre>
                                        )}
                                    </div>
                                )}
                            </span>
                        </div>
                    ))
                ).flat();
            
            case 'system':
                return logs.system.map((log, index) => (
                    <div key={index} className={`log-entry ${log.level.toLowerCase()}`}>
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">{log.level}</span>
                        <span className="log-message">{log.message}</span>
                    </div>
                ));
            
            case 'api':
                return logs.api.map((log, index) => (
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
            <div className="log-content">
                {renderLogs()}
            </div>
        </div>
    );
};
