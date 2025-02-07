import React, { createContext, useContext, useMemo } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useArtifacts } from './ArtifactContext';
import { UUID } from '../../../../types/uuid';

interface FilteredArtifactContextType {
  filteredArtifacts: Artifact[];
  currentArtifact: Artifact | null;
  isLoading: boolean;
  isChannelView: boolean;
}

const FilteredArtifactContext = createContext<FilteredArtifactContextType | null>(null);

export const FilteredArtifactProvider = ({ 
  channelId,
  threadId,
  artifactId,
  children 
}: { 
  channelId: UUID | null;
  threadId: UUID | null;
  artifactId: UUID | null;
  children: React.ReactNode 
}) => {
  const { artifacts, isLoading } = useArtifacts();

  const filteredArtifacts = useMemo(() => {
    if (!channelId) return [];
    
    return artifacts.filter(artifact => {
      // Filter by channel
      if (artifact.metadata?.channelId !== channelId) return false;
      
      // Filter by thread if specified
      if (threadId && artifact.metadata?.threadId !== threadId) return false;
      
      return true;
    });
  }, [artifacts, channelId, threadId]);

  const currentArtifact = useMemo(() => {
    if (!artifactId) return null;
    return artifacts.find(a => a.id === artifactId) || null;
  }, [artifacts, artifactId]);

  const value = useMemo(() => ({
    filteredArtifacts,
    currentArtifact,
    isLoading,
    isChannelView: !!channelId && !threadId
  }), [filteredArtifacts, currentArtifact, isLoading, channelId, threadId]);

  return (
    <FilteredArtifactContext.Provider value={value}>
      {children}
    </FilteredArtifactContext.Provider>
  );
};

export const useFilteredArtifacts = () => {
  const context = useContext(FilteredArtifactContext);
  if (!context) {
    throw new Error('useFilteredArtifacts must be used within a FilteredArtifactProvider');
  }
  return context;
};
