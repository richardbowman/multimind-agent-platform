import React, { useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

const App: React.FC = () => {
    const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
    const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

    return (
      <WebSocketProvider>
        <div className="app">
            <div className="sidebar">
                <ChannelList 
                    onChannelSelect={setCurrentChannelId}
                    currentChannelId={currentChannelId}
                />
                <ThreadList
                    channelId={currentChannelId}
                    onThreadSelect={setCurrentThreadId}
                    currentThreadId={currentThreadId}
                />
            </div>
            <div className="main-content">
                <ChatPanel
                    currentChannelId={currentChannelId}
                    currentThreadId={currentThreadId}
                />
            </div>
            <div className="right-sidebar">
                <TaskPanel
                    channelId={currentChannelId}
                    threadId={currentThreadId}
                />
                <ArtifactPanel
                    channelId={currentChannelId}
                    threadId={currentThreadId}
                />
            </div>
        </div>
      </WebSocketProvider>
    );
};

export default App;
