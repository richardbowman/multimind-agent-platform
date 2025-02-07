import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';
import { ClientMessage } from '../../../../shared/types';
import { ChannelData, CreateChannelParams } from '../../../../shared/channelTypes';
import { useSnackbar } from './SnackbarContext';
import { useIPCService } from './IPCContext';
import { useClientMethods } from '../services/ClientMethods';
import { Artifact } from '../../../../tools/artifact';
import { Settings } from '../../../../tools/settings';
import { ClientError } from '@mattermost/client';
import { UUID } from '../../../../types/uuid';
import { Task } from '../../../../tools/taskManager';
const DataContext = createContext<DataContextMethods | null>(null);

export interface Paths {
  appPath: string;
  modelsPath: string;
}

export interface DataContextMethods {
  messages: ClientMessage[];
  channels: ChannelData[];
  tasks: Task[];
  pendingFiles: Artifact[];
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  handles: Array<{ id: string, handle: string }>;
  currentChannelId: UUID | null;
  currentThreadId: UUID | null;
  isLoading: boolean;
  needsConfig: boolean | null;
  settings: Settings | null;
  paths: Paths | null;
  setPaths: React.Dispatch<React.SetStateAction<Paths>>;
  sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
  fetchChannels: () => Promise<void>;
  fetchTasks: (channelId: string, threadId: string | null) => Promise<Task[]>;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => Promise<void>;
  fetchHandles: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setLogs: React.Dispatch<React.SetStateAction<{
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  }>>;
  setNeedsConfig: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentChannelId: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<Settings|ClientError>;
  createChannel: (params: CreateChannelParams) => Promise<string>;
  deleteChannel: (channelId: string) => Promise<void>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  markTaskComplete: (taskId: string, complete: boolean) => Promise<void>;
  addPendingFiles: (artifacts: Artifact[]) => Promise<void>;
  resetPendingFiles: () => void;
  showFileDialog: () => Promise<void>;
}

export const DataProvider: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => {

  const ipcService = useIPCService();
  const { showSnackbar } = useSnackbar();

  const [paths, setPaths] = useState<Paths|null>();
  const [settings, setSettings] = useState<Settings|null>();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [handles, setHandles] = useState<Array<{ id: string, handle: string }>>([]);
  const [currentChannelId, _setCurrentChannelId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);


  
  const setCurrentChannelId = useCallback((channelId: string | null) => {
    if (channelId) {
      localStorage.setItem('lastChannelId', channelId);
    } else {
      localStorage.removeItem('lastChannelId');
    }
    _setCurrentChannelId(channelId);
  }, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentThreadArtifacts, setCurrentThreadArtifacts] = useState<any[]>([]);
  const [allArtifacts, setAllArtifacts] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Artifact[]>([]);
  const [logs, setLogs] = useState<{
    llm: Record<string, LLMLogEntry[]>;
    system: {
      logs: any[];
      total: number;
    };
    api: {
      logs: any[];
      total: number;
    };
  }>({
    llm: {},
    system: {
      logs: [],
      total: 0
    },
    api: {
      logs: [],
      total: 0
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(null);

  // Fetch messages whenever channel or thread changes
  useEffect(() => {
    const loadChannelData = async () => {
      if (currentChannelId && isLoading === false) {
        setIsLoading(true);
        setMessages([]); // Clear messages before loading new ones

        const [newMessages] = await Promise.all([
          ipcService.getRPC().getMessages({ channelId: currentChannelId, threadId: currentThreadId }),
          fetchTasks(currentChannelId, currentThreadId),
          fetchArtifacts(currentChannelId, currentThreadId)
        ]);

        setMessages(newMessages);
        setIsLoading(false);
      }
    };

    loadChannelData();
  }, [currentChannelId, currentThreadId]);

  const getSettings = () => ipcService.getRPC().getSettings();

  const fetchSettings = async () => {
    setSettings(await getSettings());
  }

  useEffect(() => {
    if (needsConfig === false) {
        // Trigger initial data fetch when backend is ready
        try {
            const lastChannel = localStorage.getItem('lastChannelId');
            setCurrentChannelId(lastChannel);

            fetchChannels();
            fetchHandles();
            fetchAllArtifacts();
            fetchSettings();
        } catch (error) {
            console.error(error);
        };
    }
  }, [needsConfig]);

  // Update loading state when messages are received
  useEffect(() => {
    setIsLoading(false);
  }, [messages]);

  const isElectron = !!(window as any).electron;

  const sendMessage = useCallback(async (message: Partial<ClientMessage>) => {
    const result = await ipcService.getRPC().sendMessage(message);
    if (result) {
      setMessages(prev => {
        const newMessages = [result].filter(message =>
          !prev.some(m => m.id === message.id)
        );
        return [...prev, ...newMessages].sort((a, b) => a.create_at - b.create_at);
      });
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const newChannels = await ipcService.getRPC().getChannels();
      setChannels(newChannels);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const fetchHandles = useCallback(async () => {
    const newHandles = await ipcService.getRPC().getHandles();
    setHandles(newHandles);
  }, []);

  const fetchTasks = useCallback(async (channelId: string, threadId: string | null) => {
    const newTasks = await ipcService.getRPC().getTasks({ channelId, threadId });
    setTasks(newTasks);
  }, []);

  const fetchArtifacts = useCallback(async (channelId: string, threadId: string | null) => {
    // Only fetch if we have a valid channel ID
    if (!channelId) return;
    
    // Debounce artifact fetching
    const newArtifacts = await ipcService.getRPC().getArtifacts({ channelId, threadId });
    
    // Only update state if artifacts have actually changed
    setCurrentThreadArtifacts(prev => {
      const prevIds = new Set(prev.map(a => a.id));
      const newIds = new Set(newArtifacts.map(a => a.id));
      
      // If sets are equal, return previous artifacts to prevent re-render
      if (prevIds.size === newIds.size && 
          [...prevIds].every(id => newIds.has(id))) {
        return prev;
      }
      
      return newArtifacts;
    });
  }, []);

  const fetchAllArtifacts = useCallback(async () => {
    const newArtifacts = await ipcService.getRPC().listArtifacts();
    setAllArtifacts(newArtifacts);
  }, []);

  const deleteArtifact = useCallback(async (artifactId: string) => {
    const remainingArtifacts = await ipcService.getRPC().deleteArtifact(artifactId);
    setCurrentThreadArtifacts(remainingArtifacts);
    setAllArtifacts(remainingArtifacts);
  }, []);

  const saveArtifact = useCallback(async (artifact: any) => {
    const savedArtifact = await ipcService.getRPC().saveArtifact(artifact);
    
    // Update all artifacts list
    setAllArtifacts(prev => {
      const existingIndex = prev.findIndex(a => a.id === savedArtifact.id);
      if (existingIndex >= 0) {
        // Update existing artifact
        const newArtifacts = [...prev];
        newArtifacts[existingIndex] = savedArtifact;
        return newArtifacts;
      }
      // Add new artifact
      return [...prev, savedArtifact];
    });

    // Update channel artifacts if present
    setCurrentThreadArtifacts(prev => {
      const existingIndex = prev.findIndex(a => a.id === savedArtifact.id);
      if (existingIndex >= 0) {
        // Update existing artifact
        const newArtifacts = [...prev];
        newArtifacts[existingIndex] = savedArtifact;
        return newArtifacts;
      }
      return prev;
    });

    return savedArtifact;
  }, []);

  const addArtifactToChannel = useCallback(async (channelId: string, artifactId: string) => {
    await ipcService.getRPC().addArtifactToChannel(channelId, artifactId);
    // Update channels state
    setChannels(prevChannels => prevChannels.map(channel => 
      channel.id === channelId 
        ? { ...channel, artifactIds: [...(channel.artifactIds || []), artifactId] }
        : channel
    ));
  }, []);

  const removeArtifactFromChannel = useCallback(async (channelId: string, artifactId: string) => {
    await ipcService.getRPC().removeArtifactFromChannel(channelId, artifactId);
    // Update channels state
    setChannels(prevChannels => prevChannels.map(channel => 
      channel.id === channelId 
        ? { ...channel, artifactIds: (channel.artifactIds || []).filter(id => id !== artifactId) }
        : channel
    ));
  }, []);

  const fetchLogs = useCallback(async (logType: 'llm' | 'system' | 'api', params?: {
    limit?: number;
    offset?: number;
    filter?: {
      search?: string;
    };
  }) => {
    const newLogs = await ipcService.getRPC().getLogs(logType, params);
    
    if (logType === 'llm') {
      setLogs(prev => ({
        ...prev,
        llm: newLogs
      }));
    } else {
      setLogs(prev => ({
        ...prev,
        [logType]: {
          logs: params?.offset 
            ? [...(prev[logType]?.logs || []), ...newLogs.logs]
            : newLogs.logs,
          total: newLogs.total
        }
      }));
    }
    
    return newLogs;
  }, []);


  const contextMethods = useMemo(() => ({
    messages,
    channels,
    tasks,
    pendingFiles,
    logs,
    handles,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    settings,
    paths: paths,
    setPaths,
    sendMessage,
    fetchChannels,
    fetchTasks,
    fetchLogs,
    fetchHandles,
    setMessages,
    setLogs,
    setNeedsConfig,
    setCurrentChannelId,
    setCurrentThreadId,
    setTasks,
    getSettings,
    updateSettings: async (settings: Settings) => {
      try {
        const updatedSettings = await ipcService.getRPC().updateSettings(settings);

        if (updatedSettings.settings && !updatedSettings.error) {
          ipcService.disconnect();
          ipcService.connect();
          await Promise.all([fetchChannels(), fetchHandles(), fetchAllArtifacts()]);
        }

        return updatedSettings;
      } catch (error) {
        console.error('Failed to update settings:', error);
        throw error;
      }
    },
    createChannel: (params: CreateChannelParams) => ipcService.getRPC().createChannel(params),
    deleteChannel: async (channelId: string) => {
      await ipcService.getRPC().deleteChannel(channelId);
      await fetchChannels();
    },
    markTaskComplete: async (taskId: string, complete: boolean) => {
      const updatedTask = await ipcService.getRPC().markTaskComplete(taskId, complete);
      setTasks(prev => prev.map(t =>
        t.id === updatedTask.id ? updatedTask : t
      ));
    },
    addPendingFiles: (artifacts: Artifact[]) => {
      setPendingFiles([
        ...pendingFiles,
        ...artifacts
      ]);
      setAllArtifacts([
        ...allArtifacts,
        ...artifacts
      ]);
    },
    resetPendingFiles: () => {
      setPendingFiles([]);
    },
    showFileDialog: async () => {
      ipcService.getRPC().showFileDialog();
    }
  } as DataContextMethods), [
    messages,
    channels,
    tasks,
    currentThreadArtifacts,
    allArtifacts,
    logs,
    handles,
    settings,
    currentChannelId,
    currentThreadId,
    isLoading,
    needsConfig,
    pendingFiles,
    sendMessage,
    fetchChannels,
    fetchTasks,
    fetchArtifacts,
    fetchAllArtifacts,
    fetchLogs,
    fetchHandles,
    saveArtifact,
    deleteArtifact,
    setCurrentChannelId,
    setCurrentThreadId,
    setSettings,
    setTasks
  ]);

  return (
    <DataContext.Provider value={contextMethods}>
      {typeof children === 'function' 
        ? children({ contextMethods }) 
        : children}
    </DataContext.Provider>
  );
};

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
};

