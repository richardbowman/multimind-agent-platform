import React, { useState } from 'react';
import { useWebSocket } from './contexts/WebSocketContext';
import { ChatPanel } from './components/ChatPanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { GlobalArtifactViewer } from './components/GlobalArtifactViewer';
import { LogViewer } from './components/LogViewer';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

const App: React.FC = () => {
    const { currentChannelId, currentThreadId, setCurrentThreadId } = useWebSocket();
    const [currentTab, setCurrentTab] = useState<'chat' | 'artifacts' | 'logs'>('chat');
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system' | 'api'>('llm');

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
                <button 
                    className={`tab-button ${currentTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('logs')}
                >
                    Logs
                </button>
            </div>
            <div className={currentTab === 'chat' ? 'chat-layout' : 'artifacts-layout'}>
                {currentTab === 'chat' ? (
                    <>
                    <div className="sidebar">
                    <ChannelList />
                    <ThreadList
                        channelId={currentChannelId}
                        onThreadSelect={setCurrentThreadId}
                        currentThreadId={currentThreadId}
                    />
                </div>
                <div className="main-content">
                    <ChatPanel
                        currentThreadId={currentThreadId}
                        setCurrentThreadId={setCurrentThreadId}
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
      </WebSocketProvider>
    );
};

export default App;
