import type { ClientMessage } from '../shared/IPCInterface';
import type { LogParam } from '../../../../llm/LLMLogger';
import type { DataContextMethods } from '../contexts/DataContext';
import { ClientMethods } from '../shared/RPCInterface';

export const createClientMethods : ClientMethods = (contextMethods: DataContextMethods) => ({
    onMessage: async (messages: ClientMessage[]) => {
        // Update messages directly in context
        contextMethods.setMessages(prev => {
            const filteredPrev = prev.filter(prevMessage => 
                !messages.some(newMessage => newMessage.id === prevMessage.id)
            );
            return [...filteredPrev, ...messages].sort((a, b) => a.create_at - b.create_at);
        });

        // Check for artifact references
        const hasArtifactLinks = messages.some(message => 
            message.content?.includes('artifact:') || 
            message.metadata?.artifactIds?.length > 0
        );

        if (hasArtifactLinks && contextMethods.currentChannelId) {
            await contextMethods.fetchArtifacts(
                contextMethods.currentChannelId, 
                contextMethods.currentThreadId
            );
        }
    },

    onLogUpdate: (update: LogParam) => {
        if (update.type === 'llm') {
            contextMethods.setLogs(prev => ({
                ...prev,
                llm: {
                    ...prev.llm,
                    [update.entry.service]: [
                        ...(prev.llm[update.entry.service] || []),
                        update.entry
                    ]
                }
            }));
        }
    },

    onBackendStatus: (status: { configured: boolean; ready: boolean; message?: string }) => {
        contextMethods.setNeedsConfig(!status.configured);
        if (status.configured) {
            // Trigger initial data fetch when backend is ready
            Promise.all([
                contextMethods.fetchChannels(),
                contextMethods.fetchHandles()
            ]).catch(console.error);
        }
    },
    
    onTaskUpdate: (task: ClientTask) => {
        contextMethods.setTasks(prevTasks => {
            // Find and replace the updated task
            const existingIndex = prevTasks.findIndex(t => t.id === task.id);
            if (existingIndex >= 0) {
                const newTasks = [...prevTasks];
                newTasks[existingIndex] = task;
                return newTasks;
            }
            // If it's a new task, add it to the list
            return [...prevTasks, task];
        });
    }
});
