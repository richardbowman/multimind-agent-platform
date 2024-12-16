import React, { useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { GlobalArtifactViewer } from './components/GlobalArtifactViewer';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

const App: React.FC = () => {
    const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
    const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
    const [currentTab, setCurrentTab] = useState<'chat' | 'artifacts'>('chat');

    return (
      <WebSocketProvider>
        <div className="app">
            <div className="tab-bar">
                <button 
                    className={`tab-button ${currentTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('chat')}
                >
                    Chat
                </button>
                <button 
                    className={`tab-button ${currentTab === 'artifacts' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('artifacts')}
                >
                    Artifacts
                </button>
            </div>
            {currentTab === 'chat' ? (
                <>
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
                </>
            ) : (
                <GlobalArtifactViewer />
            )}
        </div>
      </WebSocketProvider>
    );
};

export default App;
