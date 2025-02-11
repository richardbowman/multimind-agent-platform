import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { ChannelData, CreateChannelParams } from '../../../../shared/channelTypes';
import { useIPCService } from './IPCContext';
import { useDataContext } from './DataContext';
import { asUUID, UUID } from '../../../../types/uuid';
import { ClientProject } from '../../../../shared/types';

export interface ChannelContextType {
  channels: ChannelData[];
  currentChannelId: UUID | null;
  currentChannel: ChannelData | null;
  currentChannelProject: ClientProject | null;
  fetchChannels: () => Promise<void>;
  createChannel: (params: CreateChannelParams) => Promise<string>;
  deleteChannel: (channelId: string) => Promise<void>;
  setCurrentChannelId: (channelId: UUID | null) => void;
}

const ChannelContext = createContext<ChannelContextType | null>(null);

export const ChannelProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const { needsConfig } = useDataContext();
  const [currentChannelId, _setCurrentChannelId] = useState<UUID | null>(null);
  const [currentChannel, setCurrentChannel] = useState<ChannelData | null>(null);
  const [currentChannelProject, setCurrentChannelProject] = useState<ClientProject | null>(null);

  const setCurrentChannelId = useCallback((channelId: UUID | null) => {
    if (channelId) {
      localStorage.setItem('lastChannelId', channelId);
    } else {
      localStorage.removeItem('lastChannelId');
    }
    return _setCurrentChannelId(channelId);
  }, []);

  useEffect(() => {
    const channel = channels.find(c => c.id === currentChannelId) || null;
    setCurrentChannel(channel);
    if (channel) {
      ipcService.getRPC().getProject(channel.projectId).then(p => setCurrentChannelProject(p));      
    }
    
  }, [currentChannelId, channels]);

  useEffect(() => {
      // Trigger initial data fetch when backend is ready
      try {
        if (currentChannelId == null) {
          const lastChannel = localStorage.getItem('lastChannelId');
          if (lastChannel && channels.find(c => c.id === lastChannel)) {
            _setCurrentChannelId(asUUID(lastChannel));
          } else if (channels?.length > 0) {
            _setCurrentChannelId(channels[0].id)
          }
        }
      } catch (error) {
        console.error(error);
      };
  }, [channels]);
  
  const fetchChannels = useCallback(async () => {
    try {
      if (ipcService.getRPC() && !needsConfig) {
        const newChannels = await ipcService.getRPC().getChannels();
        setChannels(newChannels);
      }
    } catch (error) {
      console.error(error);
    }
  }, [ipcService]);

  useEffect(() => {
    fetchChannels();
}, [needsConfig]);

  const createChannel = useCallback(async (params: CreateChannelParams) => {
    const channelId = await ipcService.getRPC().createChannel(params);
    await fetchChannels();
    return channelId;
  }, [ipcService, fetchChannels]);

  const deleteChannel = useCallback(async (channelId: string) => {
    await ipcService.getRPC().deleteChannel(channelId);
    await fetchChannels();
  }, [ipcService, fetchChannels]);

  const value = useMemo(() => ({
    channels,
    currentChannelId,
    currentChannelProject,
    currentChannel,
    fetchChannels,
    createChannel,
    deleteChannel,
    setCurrentChannelId
  }), [channels, currentChannelId, currentChannel, currentChannelProject, fetchChannels, createChannel, deleteChannel, setCurrentChannelId]);

  return (
    <ChannelContext.Provider value={value}>
      {children}
    </ChannelContext.Provider>
  );
};

export const useChannels = () => {
  const context = useContext(ChannelContext);
  if (!context) {
    throw new Error('useChannels must be used within a ChannelProvider');
  }
  return context;
};
