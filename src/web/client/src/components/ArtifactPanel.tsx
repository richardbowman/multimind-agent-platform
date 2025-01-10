import React, { useEffect, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { ArtifactViewer } from './ArtifactViewer';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { artifacts, fetchArtifacts } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

    useEffect(() => {
        let isSubscribed = true;

        const loadArtifacts = async () => {
            if (channelId && isSubscribed) {
                await fetchArtifacts(channelId, threadId);
            }
        };

        loadArtifacts();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);

    return (
        <Grid container sx={{ height: 'calc(100vh - 48px)', gap: 1 }}>
            <Grid item xs={3} sx={{ p: 1, borderRight: '1px solid #444', overflowY: 'auto' }}>
                <Typography variant="h2" sx={{ mb: 1, color: '#999', textTransform: 'uppercase' }}>
                    Artifacts
                </Typography>
                <Grid container sx={{ gap: 1, p: 0.5 }}>
                    {(artifacts || []).map((artifact : Artifact) => (
                        <Paper 
                            key={artifact.id} 
                            sx={{ 
                                bgcolor: '#2a2a2a', 
                                border: '1px solid #444', 
                                borderRadius: 8, 
                                p: 1, 
                                cursor: 'pointer',
                                ...(selectedArtifact?.id === artifact.id ? { borderColor: '#4a9eff', bgcolor: '#333' } : {})
                            }}
                            onClick={() => setSelectedArtifact(artifact)}
                        >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Typography sx={{ bgcolor: '#333', color: '#4a9eff', p: 0.2, borderRadius: 4, fontSize: 0.8 }}>
                                    {artifact.type}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography sx={{ color: '#666', fontSize: 0.8 }}>#{artifact.id}</Typography>
                                </Box>
                            </Box>
                            <Typography sx={{ fontWeight: 500, mb: 0.5, color: '#fff' }}>
                                {artifact.metadata?.title || 'Untitled'}
                            </Typography>
                        </Paper>
                    ))}
                </Grid>
            </Grid>
            <Grid item xs={9} sx={{ p: 1 }}>
                {selectedArtifact ? (
                    <ArtifactViewer 
                        artifact={selectedArtifact} 
                        onClose={() => setSelectedArtifact(null)}
                    />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontStyle: 'italic' }}>
                        Select an artifact to view its details
                    </Box>
                )}
            </Grid>
        </Grid>
    );
};
