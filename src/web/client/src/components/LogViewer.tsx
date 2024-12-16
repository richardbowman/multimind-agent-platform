import React, { useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

export const LogViewer: React.FC = () => {
    const { logs, fetchLogs } = useWebSocket();

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000); // Refresh logs every 5 seconds
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="log-viewer">
            <div className="log-content">
                {logs.map((log, index) => (
                    <div key={index} className={`log-entry ${log.level.toLowerCase()}`}>
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                        <span className="log-level">{log.level}</span>
                        <span className="log-message">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
