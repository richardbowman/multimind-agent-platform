import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useIPCService } from './IPCContext';
import { UUID } from '../../../../types/uuid';

interface ArtifactContextType {
  artifacts: Artifact[];
  currentChannelId: UUID | null;
  currentThreadId: UUID | null;
  isLoading: boolean;
  fetchArtifacts: (channelId: UUID, threadId: UUID | null) => Promise<void>;
  fetchAllArtifacts: () => Promise<void>;
  saveArtifact: (artifact: Artifact) => Promise<Artifact>;
  deleteArtifact: (artifactId: UUID) => Promise<void>;
  addArtifactToChannel: (channelId: UUID, artifactId: UUID) => Promise<void>;
  removeArtifactFromChannel: (channelId: UUID, artifactId: UUID) => Promise<void>;
  setCurrentChannelId: (channelId: UUID | null) => void;
  setCurrentThreadId: React.Dispatch<React.SetStateAction<UUID | null>>;
}

const ArtifactContext = createContext<ArtifactContextType | null>(null);

export const ArtifactProvider = ({ children }: { children: React.ReactNode }) => {
  const ipcService = useIPCService();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<UUID | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<UUID | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchArtifacts = useCallback(async (channelId: UUID, threadId: UUID | null) => {
    if (!channelId) return;

    setIsLoading(true);
    const newArtifacts = await ipcService.getRPC().getArtifacts({ channelId, threadId });
    setArtifacts(newArtifacts);
    setIsLoading(false);
  }, [ipcService]);

  const fetchAllArtifacts = useCallback(async () => {
    setIsLoading(true);
    const newArtifacts = await ipcService.getRPC().getAllArtifacts();
    setArtifacts(newArtifacts);
    setIsLoading(false);
  }, [ipcService]);

  const saveArtifact = useCallback(async (artifact: Artifact) => {
    const savedArtifact = await ipcService.getRPC().saveArtifact(artifact);
    setArtifacts(prev => {
      const existingIndex = prev.findIndex(a => a.id === savedArtifact.id);
      if (existingIndex >= 0) {
        const newArtifacts = [...prev];
        newArtifacts[existingIndex] = savedArtifact;
        return newArtifacts;
      }
      return [...prev, savedArtifact];
    });
    return savedArtifact;
  }, [ipcService]);

  const deleteArtifact = useCallback(async (artifactId: UUID) => {
    await ipcService.getRPC().deleteArtifact(artifactId);
    setArtifacts(prev => prev.filter(a => a.id !== artifactId));
  }, [ipcService]);

  const addArtifactToChannel = useCallback(async (channelId: UUID, artifactId: UUID) => {
    await ipcService.getRPC().addArtifactToChannel(channelId, artifactId);
  }, [ipcService]);

  const removeArtifactFromChannel = useCallback(async (channelId: UUID, artifactId: UUID) => {
    await ipcService.getRPC().removeArtifactFromChannel(channelId, artifactId);
  }, [ipcService]);

  // Fetch artifacts when channel or thread changes
  useEffect(() => {
    if (currentChannelId) {
      fetchArtifacts(currentChannelId, currentThreadId);
    }
  }, [currentChannelId, currentThreadId, fetchArtifacts]);

  const value = useMemo(() => ({
    artifacts,
    currentChannelId,
    currentThreadId,
    isLoading,
    fetchArtifacts,
    fetchAllArtifacts,
    saveArtifact,
    deleteArtifact,
    addArtifactToChannel,
    removeArtifactFromChannel,
    setCurrentChannelId,
    setCurrentThreadId
  }), [artifacts, currentChannelId, currentThreadId, isLoading, 
       fetchArtifacts, fetchAllArtifacts, saveArtifact, 
       deleteArtifact, addArtifactToChannel, removeArtifactFromChannel]);

  return (
    <ArtifactContext.Provider value={value}>
      {children}
    </ArtifactContext.Provider>
  );
};

export const useArtifacts = () => {
  const context = useContext(ArtifactContext);
  if (!context) {
    throw new Error('useArtifacts must be used within an ArtifactProvider');
  }
  return context;
};
