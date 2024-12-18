import React, { createContext, useContext, useEffect, useState } from 'react';
import webSocketService, { ClientMessage, ClientChannel, ClientThread } from '../services/WebSocketService';
import { Artifact } from '../../../../tools/artifact';
import type { LLMLogEntry } from '../../../../llm/LLMLogger';

interface WebSocketContextType {
  messages: ClientMessage[];
  channels: ClientChannel[];
  threads: Record<string, ClientThread[]>; // Keyed by channel_id
  tasks: any[];
  artifacts: Artifact[];
  handles: Array<{id: string, handle: string}>;
  logs: {
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  };
  sendMessage: (message: Partial<ClientMessage>) => void;
  fetchChannels: () => void;
  fetchThreads: (channelId: string) => void;
  fetchTasks: (channelId: string, threadId: string | null) => void;
  fetchArtifacts: (channelId: string, threadId: string | null) => void;
  fetchAllArtifacts: () => void;
  fetchHandles: () => void;
  fetchLogs: (logType: 'llm' | 'system' | 'api') => void;
  deleteArtifact: (artifactId: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  messages: [],
  channels: [],
  threads: {},
  handles: [],
  sendMessage: () => { },
  fetchChannels: () => { },
  fetchThreads: () => { },
  fetchHandles: () => { },
  tasks: [],
  artifacts: [],
  fetchTasks: (channelId: string, threadId: string | null) => { },
  fetchArtifacts: (channelId: string, threadId: string | null) => { },
  fetchAllArtifacts: () => { },
  deleteArtifact: (artifactId: string) => { },
  logs: {
    llm: {},
    system: [],
    api: []
  },
  fetchLogs: (logType: 'llm' | 'system' | 'api') => { }
});

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [channels, setChannels] = useState<ClientChannel[]>([]);
  const [threads, setThreads] = useState<Record<string, ClientThread[]>>({});
  const [handles, setHandles] = useState<Array<{id: string, handle: string}>>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [logs, setLogs] = useState<{
    llm: Record<string, LLMLogEntry[]>;
    system: any[];
    api: any[];
  }>({
    llm: {},
    system: [],
    api: []
  });

  useEffect(() => {
    webSocketService.connect();
    
    const handlesCleanup = webSocketService.onHandles((newHandles) => {
      console.log('WebSocketContext: Received handles:', newHandles);
      setHandles(newHandles);
    });

    // Handle both bulk and individual messages
    const messageCleanup = webSocketService.onMessage((messages, isLive) => {
      setMessages(prev => {
        if (!isLive) {
          // For historical messages, replace the entire list
          return messages;
        }
        
        // For live messages, append only new ones
        const newMessages = messages.filter(message => 
          !prev.some(m => m.id === message.id)
        ).map(message => {
          // If message has a root-id in props, set it as thread_id
          if (message.props && message.props['root-id']) {
            return {
              ...message,
              thread_id: message.props['root-id']
            };
          }
          return message;
        });
        
        // Update messages array, handling both new messages and reply count updates
        return prev.map(existingMsg => {
          // If this is a parent message that just got a new reply
          if (newMessages.some(newMsg => newMsg.thread_id === existingMsg.id)) {
            return {
              ...existingMsg,
              reply_count: (existingMsg.reply_count || 0) + 1
            };
          }
          return existingMsg;
        }).concat(newMessages)
        .sort((a, b) => a.create_at - b.create_at);
      });
    });

    const channelCleanup = webSocketService.onChannels((newChannels) => {
      setChannels(newChannels);
    });

    const threadCleanup = webSocketService.onThreads((newThreads) => {
      if (newThreads.length > 0) {
        const channelId = newThreads[0].rootMessage.channel_id;
        setThreads(prev => ({
          ...prev,
          [channelId]: newThreads
        }));
      }
    });

    const taskCleanup = webSocketService.onTasks((newTasks) => {
      setTasks(newTasks);
    });

    const artifactCleanup = webSocketService.onArtifacts((newArtifacts) => {
      setArtifacts(newArtifacts);
    });

    const logsCleanup = webSocketService.onLogs((newLogs) => {
      console.log('WebSocketContext: Received logs:', newLogs);
      if (!newLogs?.type || !['llm', 'system', 'api'].includes(newLogs.type)) {
        console.warn('WebSocketContext: Received invalid log type:', newLogs?.type);
        return;
      }
      setLogs(prev => ({
        ...prev,
        [newLogs.type]: newLogs.data || []
      }));
    });

    return () => {
      messageCleanup();
      channelCleanup();
      threadCleanup();
      taskCleanup();
      artifactCleanup();
      handlesCleanup();
      logsCleanup();
      webSocketService.disconnect();
    };
  }, []);

  const sendMessage = (message: Partial<ClientMessage>) => {
    webSocketService.sendMessage(message);
    // Don't emit locally - wait for server response
  };

  const fetchChannels = () => {
    webSocketService.fetchChannels();
  };

  const fetchThreads = (channelId: string) => {
    if (!threads[channelId]) {
      webSocketService.fetchThreads(channelId);
    }
  };

  const fetchHandles = () => {
    webSocketService.fetchHandles();
  };

  const fetchTasks = (channelId: string, threadId: string | null) => {
    webSocketService.fetchTasks(channelId, threadId);
  };

  const fetchArtifacts = (channelId: string, threadId: string | null) => {
    webSocketService.fetchArtifacts(channelId, threadId);
  };

  const fetchAllArtifacts = () => {
    webSocketService.fetchAllArtifacts();
  };

  const deleteArtifact = (artifactId: string) => {
    webSocketService.deleteArtifact(artifactId);
  };

  const fetchLogs = (logType: 'llm' | 'system' | 'api') => {
    webSocketService.fetchLogs(logType);
  };

  return (
    <WebSocketContext.Provider value={{ 
      messages, 
      channels, 
      threads,
      tasks,
      artifacts, 
      sendMessage, 
      fetchChannels, 
      fetchThreads,
      fetchTasks,
      fetchArtifacts,
      fetchAllArtifacts,
      logs,
      fetchLogs,
      handles,
      fetchHandles,
      deleteArtifact
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
