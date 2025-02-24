import React, { useState, useCallback } from 'react';
import { AppBar, Tabs, Tab, Toolbar, Box, Drawer, IconButton, styled, Stack } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MinimizeIcon from '@mui/icons-material/Minimize';
import MaximizeIcon from '@mui/icons-material/CropSquare';
import CloseIcon from '@mui/icons-material/Close';
import DeveloperModeIcon from '@mui/icons-material/DeveloperMode';
import { useDataContext, DataProvider } from './contexts/DataContext';
import { IPCProvider, useIPCService } from './contexts/IPCContext';
import { SnackbarProvider, useSnackbar } from './contexts/SnackbarContext';
import { LogProvider } from './contexts/LogContext';
import { ToolbarActionsProvider } from './contexts/ToolbarActionsContext';
import { ChatPanel } from './components/ChatPanel';
import { WelcomePanel } from './components/WelcomePanel';
import { ChannelList } from './components/ChannelList';
import { ThreadList } from './components/ThreadList';
import { TaskPanel } from './components/TaskPanel';
import { ArtifactPanel } from './components/ArtifactPanel';
import { GlobalArtifactViewer } from './components/GlobalArtifactViewer';
import { LogViewer } from './components/LogViewer';
import { SettingsPanel } from './components/SettingsPanel';
import './styles/App.css';
import { ChannelProvider } from './contexts/ChannelContext';
import { MessageProvider, useMessages } from './contexts/MessageContext';
import { ThreadMessageProvider } from './contexts/ThreadMessageContext';
import { ArtifactProvider } from './contexts/ArtifactContext';
import { FilteredArtifactProvider } from './contexts/FilteredArtifactContext';
import { TaskProvider } from './contexts/TaskContext';
import { FilteredTaskProvider } from './contexts/FilteredTaskContext';
import { ResizableDrawer } from './components/ResizableDrawer';

const leftDrawerWidth = 250;
const rightDrawerWidth = 300;

const Main = styled('main', { shouldForwardProp: (prop) => prop !== 'leftOpen' && prop !== 'rightOpen' })<{
    leftOpen?: boolean;
    rightOpen?: boolean;
}>(({ theme, leftOpen, rightOpen }) => ({
    flexGrow: 1,
    transition: theme.transitions.create(['margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    marginLeft: leftOpen ? 0 : `-${leftDrawerWidth}px`,
    marginRight: rightOpen ? 0 : `-${rightDrawerWidth}px`,
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
    const {
        currentChannelId,
        currentThreadId,
        setCurrentThreadId,
    } = useMessages();

    const {
        needsConfig
    } = useDataContext();

    const ipcService = useIPCService();
    const [currentTab, setCurrentTab] = useState<'chat' | 'artifacts' | 'logs' | 'settings' | 'none'>('none');
    const [showWelcome, setShowWelcome] = useState(true);
    const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
    const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
    const [rightDrawerWidth, setRightDrawerWidth] = useState(300);

    React.useEffect(() => {
        // wait for explicit answer, we start this as null
        if (needsConfig === true) {
            setCurrentTab('settings');
        } else if (needsConfig === false) {
            setCurrentTab('chat');
        }
    }, [needsConfig]);
    const [currentLogTab, setCurrentLogTab] = useState<'llm' | 'system' | 'api'>('system');


    return (
        <Box sx={{
            height: '100vh',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <AppBar
                position="fixed"
                className="app-header"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    WebkitAppRegion: 'drag',
                    cursor: 'move',
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: '-50%',
                        left: '-50%',
                        width: '200%',
                        height: '200%',
                        background: `linear-gradient(45deg, transparent 49%, rgba(74, 158, 255, 0.1) 50%, transparent 51%),
                                   linear-gradient(-45deg, transparent 49%, rgba(74, 158, 255, 0.1) 50%, transparent 51%)`,
                        backgroundSize: '20px 20px',
                        animation: 'gridMove 5s linear infinite',
                        opacity: 0.3,
                        pointerEvents: 'none',
                        zIndex: 0
                    }
                }}
            >
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => {
                            setLeftDrawerOpen(!leftDrawerOpen);
                        }}
                        sx={{ mr: 2, WebkitAppRegion: 'no-drag' }}
                    >
                        <MenuIcon />
                    </IconButton>
                    {currentTab !== 'none' && <Tabs
                        value={currentTab}
                        onChange={(_, newValue) => setCurrentTab(newValue)}
                        textColor="inherit"
                        indicatorColor="secondary"
                        sx={{ WebkitAppRegion: 'no-drag' }}
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
                            disabled={false} // Always enabled, even in reduced functionality mode
                        />
                        <Tab
                            label="Settings"
                            value="settings"
                        />
                    </Tabs>}
                    <Box sx={{ flexGrow: 1 }} /> {/* Spacer to push right icon to end */}
                    <Stack direction="row" spacing={1} sx={{ WebkitAppRegion: 'no-drag' }}>
                        {process.env.NODE_ENV === 'development' && (
                            <IconButton
                                color="inherit"
                                edge="end"
                                onClick={() => ipcService.getRPC().openDevTools()}
                                sx={{ ml: 2 }}
                            >
                                <DeveloperModeIcon />
                            </IconButton>
                        )}
                        <IconButton
                            color="inherit"
                            edge="end"
                            onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
                            sx={{ ml: 2, display: currentTab === 'chat' ? 'inline-flex' : 'none' }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <IconButton
                            color="inherit"
                            edge="end"
                            onClick={() => ipcService.getRPC().minimizeWindow()}
                            sx={{ ml: 2 }}
                        >
                            <MinimizeIcon />
                        </IconButton>
                        <IconButton
                            color="inherit"
                            edge="end"
                            onClick={() => ipcService.getRPC().maximizeWindow()}
                            sx={{ ml: 2 }}
                        >
                            <MaximizeIcon />
                        </IconButton>
                        <IconButton
                            color="inherit"
                            edge="end"
                            onClick={() => ipcService.getRPC().closeWindow()}
                            sx={{ ml: 2 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Stack>
                </Toolbar>
            </AppBar>
            <Box sx={{
                height: 'calc(100vh - 64px)', // Account for AppBar height
                display: 'flex',
                flexDirection: 'column',
                marginTop: '64px' // Account for AppBar height
            }}>
                {currentTab === 'chat' ? (
                    <>
                        <Drawer
                            variant="persistent"
                            anchor="left"
                            open={leftDrawerOpen}
                            sx={{
                                width: leftDrawerWidth,
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
                            <ChannelList
                                onChannelSelect={(channelId) => {
                                    setCurrentChannelId(channelId);
                                    setCurrentThreadId(null); // Reset thread when changing channels
                                }}
                            />
                            <ThreadList
                                channelId={currentChannelId}
                                onThreadSelect={setCurrentThreadId}
                            />
                        </Drawer>


                        <ThreadMessageProvider threadId={currentThreadId}>
                            <FilteredTaskProvider channelId={currentChannelId} threadId={currentThreadId}>
                                <Main leftOpen={leftDrawerOpen} rightOpen={rightDrawerOpen}>
                                    <ChatPanel
                                        leftDrawerOpen={leftDrawerOpen}
                                        rightDrawerOpen={rightDrawerOpen}
                                        rightDrawerWidth={rightDrawerWidth}
                                        showWelcome={showWelcome}
                                        onSwitchToWelcome={setShowWelcome}
                                    />
                                </Main>

                                <ResizableDrawer
                                    anchor="right"
                                    open={rightDrawerOpen}
                                    width={rightDrawerWidth}
                                    onWidthChange={setRightDrawerWidth}
                                    onResizeEnd={(newWidth) => {
                                        // Update the chat panel width when resizing ends
                                        setRightDrawerWidth(newWidth);
                                    }}
                                    minWidth={200}
                                    maxWidth={800}
                                    onClose={() => setRightDrawerOpen(false)}
                                >
                                    <Toolbar /> {/* For spacing under app bar */}
                                    <FilteredTaskProvider
                                        channelId={currentChannelId}
                                        threadId={currentThreadId}
                                    >
                                        <TaskPanel />
                                    </FilteredTaskProvider>
                                    <ToolbarActionsProvider>
                                        <FilteredArtifactProvider
                                            channelId={currentChannelId}
                                            threadId={currentThreadId}
                                            artifactId={null}
                                        >
                                            <ArtifactPanel
                                                channelId={currentChannelId}
                                                threadId={currentThreadId}
                                            />
                                        </FilteredArtifactProvider>
                                    </ToolbarActionsProvider>
                                </ResizableDrawer>
                            </FilteredTaskProvider>
                        </ThreadMessageProvider>
                    </>
                ) : currentTab === 'artifacts' ? (
                    <ToolbarActionsProvider>
                        <GlobalArtifactViewer
                            drawerOpen={leftDrawerOpen}
                            onDrawerToggle={() => setLeftDrawerOpen(!leftDrawerOpen)}
                        />
                    </ToolbarActionsProvider>
                ) : currentTab === 'settings' ? (
                    <SettingsPanel
                        drawerOpen={leftDrawerOpen}
                        onDrawerToggle={() => setLeftDrawerOpen(!leftDrawerOpen)} />
                ) : currentTab === 'logs' ? (
                    <LogViewer logType={currentLogTab} />
                ) : null}
            </Box>
        </Box>
    );
};

const App: React.FC = () => {
    const { showSnackbar } = useSnackbar();

    return (
        <IPCProvider>
            <SnackbarProvider>
                <DataProvider>
                    <ChannelProvider>
                        <MessageProvider>
                            <ArtifactProvider>
                                <TaskProvider>
                                    <LogProvider>
                                        <AppContent />
                                        <div id="portal-root"></div>
                                    </LogProvider>
                                </TaskProvider>
                            </ArtifactProvider>
                        </MessageProvider>
                    </ChannelProvider>
                </DataProvider>
            </SnackbarProvider>
        </IPCProvider>
    );
};

export default App;
