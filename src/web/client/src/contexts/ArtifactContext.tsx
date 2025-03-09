import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { Artifact, ArtifactItem } from '../../../../tools/artifact';
import { useIPCService } from './IPCContext';
import { UUID } from '../../../../types/uuid';
import { useDataContext } from '../contexts/DataContext';

export interface ArtifactContextType {
  artifacts: ArtifactItem[];
  isLoading: boolean;
  fetchAllArtifacts: () => Promise<void>;
  saveArtifact: (artifact: Artifact) => Promise<Artifact>;
  deleteArtifact: (artifactId: UUID) => Promise<void>;
  updateSpecificArtifacts: (artifactIds: UUID[]) => Promise<void>;
  getArtifact: (artifactId: UUID) => Promise<Artifact | null>;
}

const ArtifactContext = createContext<ArtifactContextType | null>(null);

export const ArtifactProvider = ({ children }: { children: React.ReactNode }) => {
  const { needsConfig } = useDataContext();
  const ipcService = useIPCService();
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [currentChannelId] = useState<UUID | null>(null);
  const [currentThreadId] = useState<UUID | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllArtifacts = useCallback(async () => {
    if (ipcService.getRPC() && !needsConfig) {
      setIsLoading(true);
      const newArtifacts = await ipcService.getRPC().listArtifacts();
      setArtifacts(newArtifacts);
      setIsLoading(false);
    }
  }, [ipcService]);

  const updateSpecificArtifacts = useCallback(async (artifactIds: UUID[]) => {
    if (ipcService.getRPC() && !needsConfig) {
      try {
        const allArtifacts = await ipcService.getRPC().listArtifacts();
        const newArtifacts = allArtifacts.filter(artifact => artifactIds.includes(artifact.id));
        setArtifacts(prev => {
          const updatedArtifacts = [...prev];
          for (const newArtifact of newArtifacts) {
            const existingIndex = updatedArtifacts.findIndex(a => a.id === newArtifact.id);
            if (existingIndex >= 0) {
              // Only update if version is newer
              if (newArtifact.metadata.version > updatedArtifacts[existingIndex]?.metadata?.version) {
                updatedArtifacts[existingIndex] = newArtifact;
              }
            } else {
              updatedArtifacts.push(newArtifact);
            }
          }
          return updatedArtifacts;
        });
      } catch (error) {
        console.error('Failed to update specific artifacts:', error);
        // Optionally set some error state here if needed
      }
    }
  }, [ipcService, needsConfig]);

  useEffect(() => {
    fetchAllArtifacts();
  }, [needsConfig]);

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

  const getArtifact = useCallback(async (artifactId: UUID) => {
    if (ipcService.getRPC() && !needsConfig) {
      try {
        return await ipcService.getRPC().getArtifact(artifactId);
      } catch (error) {
        console.error('Failed to load artifact:', error);
        return null;
      }
    }
    return null;
  }, [ipcService, needsConfig]);

  const value = useMemo(() => ({
    artifacts,
    isLoading,
    fetchAllArtifacts,
    saveArtifact,
    deleteArtifact,
    updateSpecificArtifacts,
    getArtifact
  }), [artifacts, currentChannelId, currentThreadId, isLoading, 
       fetchAllArtifacts, saveArtifact, deleteArtifact, updateSpecificArtifacts, getArtifact]);

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
