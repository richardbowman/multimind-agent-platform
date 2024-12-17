import React, { useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface LogViewerProps {
    logType: 'llm' | 'system' | 'api';
}

export const LogViewer: React.FC<LogViewerProps> = ({ logType }) => {
    const { logs, fetchLogs } = useWebSocket();

    useEffect(() => {
        console.log('LogViewer: Fetching logs for type:', logType);
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000); // Refresh logs every 5 seconds
        return () => clearInterval(interval);
    }, [logType, fetchLogs]); // Re-fetch when log type changes

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
                                {log.error && <>
                                    <br/>Error: {log.error.message}
                                    <br/>Stack: {log.error.stack}
                                </>}
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
