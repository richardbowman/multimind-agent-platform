import React, { useState } from 'react';
import { AppBar, Tabs, Tab, Toolbar, Box, Drawer, IconButton, styled } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useWebSocket, DataProvider } from './contexts/DataContext';
import { ChatPanel } from './components/ChatPanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { GlobalArtifactViewer } from './components/GlobalArtifactViewer';
import { LogViewer } from './components/LogViewer';
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

const drawerWidth = 250;

const Main = styled('main', { shouldForwardProp: (prop) => prop !== 'leftOpen' && prop !== 'rightOpen' })<{
    leftOpen?: boolean;
    rightOpen?: boolean;
}>(({ theme, leftOpen, rightOpen }) => ({
    flexGrow: 1,
    padding: theme.spacing(3),
    transition: theme.transitions.create(['margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    marginLeft: leftOpen ? 0 : `-${drawerWidth}px`,
    marginRight: rightOpen ? 0 : `-${drawerWidth}px`,
    ...(leftOpen && {
        transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
        marginLeft: 0,
    }),
    ...(rightOpen && {
        transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
        marginRight: 0,
    }),
}));

const AppContent: React.FC = () => {
    const { currentChannelId, currentThreadId, setCurrentThreadId, needsConfig } = useWebSocket();
    const [currentTab, setCurrentTab] = useState<'chat' | 'artifacts' | 'logs' | 'settings'>('chat');
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(true);

    React.useEffect(() => {
        if (needsConfig) {
            setCurrentTab('settings');
        } else {
            setCurrentTab('chat');
        }
    }, [needsConfig]);
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system' | 'api'>('llm');

    return (
        <Box sx={{
            height: 'calc(100vh - 60px)',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            marginTop: '60px'
        }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
                        sx={{ mr: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <IconButton
                        color="inherit"
                        edge="end"
                        onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
                        sx={{ mr: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Tabs
                        value={currentTab}
                        onChange={(_, newValue) => setCurrentTab(newValue)}
                        textColor="inherit"
                        indicatorColor="secondary"
                    >
                        <Tab
                            label="Chat"
                            value="chat"
                            disabled={needsConfig}
                        />
                        <Tab
                            label="Artifacts"
                            value="artifacts"
                            disabled={needsConfig}
                        />
                        <Tab
                            label="Logs"
                            value="logs"
                            disabled={needsConfig}
                        />
                        <Tab
                            label="Settings"
                            value="settings"
                        />
                    </Tabs>
                </Toolbar>
            </AppBar>
            <div className={currentTab === 'chat' ? 'chat-layout' : 'artifacts-layout'}>
                {currentTab === 'chat' ? (
                    <>
                        <Drawer
                            variant="persistent"
                            anchor="left"
                            open={leftDrawerOpen}
                            sx={{
                                width: 250,
                                flexShrink: 0,
                                '& .MuiDrawer-paper': {
                                    width: 250,
                                    boxSizing: 'border-box',
                                    backgroundColor: '#2a2a2a',
                                    borderRight: '1px solid #444'
                                },
                            }}
                        >
                            <Toolbar /> {/* For spacing under app bar */}
                            <ChannelList />
                            <ThreadList channelId={currentChannelId} />
                        </Drawer>


                        <Main leftOpen={leftDrawerOpen} rightOpen={rightDrawerOpen}>
                            <ChatPanel
                                leftDrawerOpen={leftDrawerOpen}
                                rightDrawerOpen={rightDrawerOpen}
                            />
                        </Main>

                        <Drawer
                            variant="persistent"
                            anchor="right"
                            open={rightDrawerOpen}
                            sx={{
                                width: 300,
                                flexShrink: 0,
                                '& .MuiDrawer-paper': {
                                    width: 300,
                                    boxSizing: 'border-box',
                                    backgroundColor: '#2a2a2a',
                                    borderLeft: '1px solid #444'
                                },
                            }}
                        >
                            <Toolbar /> {/* For spacing under app bar */}
                            <TaskPanel
                                channelId={currentChannelId}
                                threadId={currentThreadId}
                            />
                            <ArtifactPanel
                                channelId={currentChannelId}
                                threadId={currentThreadId}
                            />
                        </Drawer>
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
        </Box>
    );
};

const App: React.FC = () => {
    return (
        <DataProvider>
            <AppContent />
        </DataProvider>
    );
};

export default App;
