import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { ClientChannel } from '../../../../shared/types';
import { CreateChannelParams } from '../../../../shared/channelTypes';
import { useIPCService } from './IPCContext';

interface ChannelContextType {
  channels: ClientChannel[];
  fetchChannels: () => Promise<void>;
  createChannel: (params: CreateChannelParams) => Promise<string>;
  deleteChannel: (channelId: string) => Promise<void>;
}

const ChannelContext = createContext<ChannelContextType | null>(null);

export const ChannelProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [channels, setChannels] = useState<ClientChannel[]>([]);

  const fetchChannels = useCallback(async () => {
    try {
      const newChannels = await ipcService.getRPC().getChannels();
      setChannels(newChannels);
    } catch (error) {
      console.error(error);
    }
  }, [ipcService]);

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
    fetchChannels,
    createChannel,
    deleteChannel
  }), [channels, fetchChannels, createChannel, deleteChannel]);

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
