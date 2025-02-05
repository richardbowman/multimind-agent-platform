import * as ort from 'onnxruntime-web';

// Default voice ID for TTS
const DEFAULT_VOICE_ID = 'en_US-hfc_female-medium';
ort.env.wasm.wasmPaths = '/';

import * as tts from '@mintplex-labs/piper-tts-web';
import type { LogParam } from '../../../../llm/LLMLogger';
import { type DataContextMethods } from '../contexts/DataContext';
import { ClientChannel, ClientMessage } from '../../../../shared/types';


// Initialize TTS system
let ttsInitialized = false;
async function initializeTTS() {
    if (!ttsInitialized) {
        try {
            // Download the model in advance
            await tts.download(DEFAULT_VOICE_ID);
            ttsInitialized = true;
        } catch (error) {
            console.error('Error initializing TTS:', error);
        }
    }
}

// Initialize on module load
initializeTTS();
import { SnackbarContextType } from '../contexts/SnackbarContext';
import { UpdateStatus } from '../../../../shared/UpdateStatus';
import { ClientMethods } from '../../../../shared/RPCInterface';
import { Artifact } from '../../../../tools/artifact';
import { message } from 'blessed';

class ClientMethodsImplementation implements ClientMethods {
    constructor(private snackbarContext: SnackbarContextType, private contextMethods: DataContextMethods) { };

    async onClientLogProcessed(success, message) {
        return;
    }

    async onFilesAttached(files: Artifact[]) {
        this.contextMethods.addPendingFiles(files);
    }

    async onMessage(messages: ClientMessage[]) {
        // Check for messages with verbal conversation flag
        const userHandle = this.contextMethods.handles.find(h => h.handle === '@user');
        for (const message of messages) {
            const rootPost = this.contextMethods.messages.find(m => message.props?.["root-id"] === m.id)

            if (rootPost?.props?.verbalConversation === true && message.user_id !== userHandle?.id) {
                try {
                    // Ensure TTS is initialized
                    await initializeTTS();
                    
                    const wav = await tts.predict({
                        text: message.message,
                        voiceId: DEFAULT_VOICE_ID,
                    });
                    const audio = new Audio();
                    audio.src = URL.createObjectURL(wav);
                    audio.play();
                } catch (error) {
                    console.error('Error playing TTS:', error);
                }
            }
        }

        // Find the latest message from a different channel/thread or not the current thread root
        const latestMessage = messages
            .filter(message =>
                message.channel_id !== this.contextMethods.currentChannelId ||
                (message.channel_id === this.contextMethods.currentChannelId &&
                    message.thread_id !== this.contextMethods.currentThreadId &&
                    message.id !== this.contextMethods.currentThreadId)
            )
            .sort((a, b) => b.create_at - a.create_at)[0];

        if (latestMessage) {
            const channelName = this.contextMethods.channels.find(c => c.id === latestMessage.channel_id)?.name || 'a channel';
            this.snackbarContext.showSnackbar({
                message: `New message in #${channelName}`,
                severity: 'info',
                persist: true,
                onClick: () => {
                    // Set both channel and thread first
                    this.contextMethods.setCurrentChannelId(latestMessage.channel_id);
                    this.contextMethods.setCurrentThreadId(latestMessage.thread_id || null);

                    // Fetch related tasks and artifacts
                    this.contextMethods.fetchChannels();
                    this.contextMethods.fetchTasks(latestMessage.channel_id, latestMessage.thread_id || null);
                    this.contextMethods.fetchArtifacts(latestMessage.channel_id, latestMessage.thread_id || null);
                }
            });
        };

        // Update messages directly in context
        this.contextMethods.setMessages(prev => {
            const filteredPrev = prev.filter(prevMessage =>
                !messages.some(newMessage => newMessage.id === prevMessage.id)
            );
            return [...filteredPrev, ...messages].sort((a, b) => a.create_at - b.create_at);
        });

        // Check for artifact references in new messages
        const hasNewArtifacts = messages.some(message =>
            message.props?.["artifact-ids"]?.length > 0
        );

        // If we have new artifacts, refresh artifacts for both current and message channels
        if (hasNewArtifacts) {
            // Refresh artifacts for current channel/thread
            if (this.contextMethods.currentChannelId) {
                await this.contextMethods.fetchArtifacts(
                    this.contextMethods.currentChannelId,
                    this.contextMethods.currentThreadId
                );
            }

            // Refresh artifacts for any channels mentioned in messages
            const uniqueChannels = new Set(messages.map(m => m.channel_id));
            for (const channelId of uniqueChannels) {
                await this.contextMethods.fetchArtifacts(
                    channelId,
                    null // Refresh all threads for the channel
                );
            }
        }
    }

    onLogUpdate(update: LogParam) {
        if (update.type === 'llm') {
            this.contextMethods.setLogs(prev => ({
                ...prev,
                llm: {
                    ...prev.llm,
                    [update.entry.service]: [
                        ...(prev.llm[update.entry.service] || []),
                        update.entry
                    ]
                }
            }));
        } else if (update.type === 'system') {
            this.contextMethods.setLogs(prev => ({
                ...prev,
                system: {
                    logs: [
                        ...(prev.system.logs || []),
                        update.entry
                    ],
                    total: (prev.system.total || 0) + 1
                }
            }));
        }
    }

    async onBackendStatus(status: { configured: boolean; ready: boolean; message?: string }) {
        this.contextMethods.setNeedsConfig(!status.configured);
    }

    onTaskUpdate(task: ClientTask) {
        this.contextMethods.setTasks(prevTasks => {
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

    onProjectUpdate(project) {
        console.log('project update not handled yet');
    }

    onChannelCreated(channel: ClientChannel) {
        // Add the new channel to the list and refresh
        this.contextMethods.fetchChannels();
    }

    onAutoUpdate(update: { status: UpdateStatus, progress?: number }) {
        this.snackbarContext.setUpdateStatus(update.status, update.progress);
    }
}

export const useClientMethods = (snackbarContext: SnackbarContextType, contextMethods: DataContextMethods) => {
    return new ClientMethodsImplementation(snackbarContext, contextMethods);
};
