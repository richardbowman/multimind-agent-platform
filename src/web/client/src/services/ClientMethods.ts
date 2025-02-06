import * as ort from 'onnxruntime-web';
import * as tts from '@mintplex-labs/piper-tts-web';
import { IPCProvider } from '../contexts/IPCContext';
import { type DataContextMethods } from '../contexts/DataContext';
import { ClientChannel, ClientMessage } from '../../../../shared/types';
import { SnackbarContextType, useSnackbar } from '../contexts/SnackbarContext';
import { UpdateStatus } from '../../../../shared/UpdateStatus';
import { ClientMethods } from '../../../../shared/RPCInterface';
import { Artifact } from '../../../../tools/artifact';
import { Task } from '../../../../tools/taskManager';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import { LogParam } from '../../../../llm/LLMLogger';


// Initialize TTS system
let ttsSession : tts.TtsSession|null = null;


class ClientMethodsImplementation implements ClientMethods {

    constructor(private ipcService: BaseRPCService, private snackbarContext: SnackbarContextType, private contextMethods: DataContextMethods) { };

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

            if (rootPost?.props?.verbalConversation === true && message.user_id !== userHandle?.id && message.message?.length > 0) {
                try {
                    // Convert basic SSML-like pauses to SSML
                    let ttsText = message.message
                        .replace(/\.{2,}/g, '<break time="500ms"/>') // Convert ... to 500ms pause
                        .replace(/\. /g, '<break time="300ms"/>') // Convert . to 300ms pause
                        .replace(/, /g, '<break time="200ms"/>'); // Convert , to 200ms pause

                    // Wrap in SSML if we have any pauses
                    if (ttsText.includes('<break')) {
                        ttsText = `<speak>${ttsText}</speak>`;
                    }

                    const wav = await tts.predict({
                        voiceId: 'en_US-ryan-high',
                        text: ttsText
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

    async onBackendStatus(status: { configured: boolean; ready: boolean; message?: string, appPath: string }) {
        this.contextMethods.setNeedsConfig(!status.configured);

        if (status.configured) {
            await this.initializeTTS(status.appPath);
        }
    }

    async initializeTTS(appPath: string) {
        const settings = await this.ipcService.getRPC().getSettings();
        const snackBar = this.snackbarContext;
    
        if (settings.tts.enabled) {
            try {
                await tts.download(settings.tts.voiceId);
    
                // ttsSession = await tts.TtsSession.create({
                //     voiceId: settings.tts.voiceId,
                //     progress: (progress) => {
                //         snackBar.showSnackbar({ 
                //             message: `Downloading voice ${progress.loaded} of ${progress.total}`, 
                //             percentComplete: progress.loaded / progress.total,
                //             severity: 'info'
                //         });
                //     },
                //     wasmPaths: {
                //         onnxWasm: appPath + "/dist/wasm/",
                //         piperData: tts.WASM_BASE.data,
                //         piperWasm: tts.WASM_BASE.wasm
                //     }
                // });
            } catch (error) {
                throw error;
            }
        }
    }

    onTaskUpdate(task: Task) {
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

export const useClientMethods = (ipcService: BaseRPCService, snackbarContext: SnackbarContextType, contextMethods: DataContextMethods) => {
    return new ClientMethodsImplementation(ipcService, snackbarContext, contextMethods);
};
