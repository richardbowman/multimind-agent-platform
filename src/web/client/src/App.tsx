import React, { useState } from 'react';
import { useWebSocket } from './contexts/WebSocketContext';
import { ChatPanel } from './components/ChatPanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { GlobalArtifactViewer } from './components/GlobalArtifactViewer';
import { LogViewer } from './components/LogViewer';
import { SettingsPanel } from './components/SettingsPanel';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

const AppContent: React.FC = () => {
    const { currentChannelId, currentThreadId, setCurrentThreadId } = useWebSocket();
    const [currentTab, setCurrentTab] = useState<'chat' | 'artifacts' | 'logs' | 'settings'>('chat');
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system' | 'api'>('llm');

    return (
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
                <button 
                    className={`tab-button ${currentTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('logs')}
                >
                    Logs
                </button>
                <button 
                    className={`tab-button ${currentTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('settings')}
                >
                    Settings
                </button>
            </div>
            <div className={currentTab === 'chat' ? 'chat-layout' : 'artifacts-layout'}>
                {currentTab === 'chat' ? (
                    <>
                    <div className="sidebar">
                    <ChannelList />
                    <ThreadList
                        channelId={currentChannelId}
                    />
                </div>
                <div className="main-content">
                    <ChatPanel
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
                ) : currentTab === 'artifacts' ? (
                    <GlobalArtifactViewer />
                ) : currentTab === 'settings' ? (
                    <SettingsPanel />
                ) : (
                    <div className="logs-container">
                        <div className="logs-subtabs">
                            <button 
                                className={`subtab-button ${currentLogTab === 'llm' ? 'active' : ''}`}
                                onClick={() => setCurrentLogTab('llm')}
                            >
                                LLM Logs
                            </button>
                            <button 
                                className={`subtab-button ${currentLogTab === 'system' ? 'active' : ''}`}
                                onClick={() => setCurrentLogTab('system')}
                            >
                                System Logs
                            </button>
                            <button 
                                className={`subtab-button ${currentLogTab === 'api' ? 'active' : ''}`}
                                onClick={() => setCurrentLogTab('api')}
                            >
                                API Logs
                            </button>
                        </div>
                        <LogViewer logType={currentLogTab} />
                    </div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <WebSocketProvider>
            <AppContent />
        </WebSocketProvider>
    );
};

export default App;
