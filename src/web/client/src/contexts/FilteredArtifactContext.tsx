import React, { createContext, useContext, useMemo } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useArtifacts } from './ArtifactContext';
import { useThreadMessages } from './ThreadMessageContext';
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
  const { threadMessages } = useThreadMessages();

  // Get artifact IDs from thread messages
  const threadArtifactIds = useMemo(() => {
    const ids = new Set(
      threadMessages
        .flatMap(msg => msg.props?.artifactIds || [])
        .filter(Boolean)
    );
    return ids;
  }, [threadMessages]);

  const filteredArtifacts = useMemo(() => {
    if (!channelId) return [];
    
    // Filter artifacts that are referenced in the thread messages
    const list = artifacts.filter(artifact => 
      threadArtifactIds.has(artifact.id)
    );
    return list;
  }, [artifacts, threadArtifactIds]);

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
