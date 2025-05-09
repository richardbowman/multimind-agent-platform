import * as tts from '@mintplex-labs/piper-tts-web';
import { DataContextMethods } from '../contexts/DataContext';
import { MessageContextType } from '../contexts/MessageContext';
import { ArtifactContextType } from '../contexts/ArtifactContext';
import { ChannelContextType } from '../contexts/ChannelContext';
import { LLMLogContextType } from '../contexts/LLMLogContext';
import { ClientMessage } from '../../../../types/viewTypes';
import { SnackbarContextType } from '../contexts/SnackbarContext';
import { UpdateStatus } from '../../../../types/UpdateStatus';
import { BackendStatus, ClientMethods, LogParam } from '../../../../types/RPCInterface';
import { Artifact } from '../../../../tools/artifact';
import { Task } from '../../../../tools/taskManager';
import { BaseRPCService } from '../../../../types/BaseRPCService';
import { ChannelData } from '../../../../types/channelTypes';
import { TaskEventType } from "../../../../types/TaskEventType";
import { TaskContextType } from '../contexts/TaskContext';
import { UUID } from '../../../../types/uuid';
import { LLMLogEntry } from '../../../../llm/LLMLogModel';
import { AsyncQueue } from '../../../../helpers/asyncQueue';

// Initialize TTS system
let ttsSession : tts.TtsSession|null = null;


class ClientMethodsImplementation implements ClientMethods {
    private queue = new AsyncQueue();

    constructor(private ipcService: BaseRPCService, 
        private snackbarContext: SnackbarContextType, 
        private contextMethods: DataContextMethods,
        private llmLogContext: LLMLogContextType,
        private messageContext: MessageContextType,
        private artifactProvider: ArtifactContextType,
        private channelContext: ChannelContextType,
        private tasksContext: TaskContextType
    ) { };

    async onClientLogProcessed(success, message) {
        return;
    }

    async onFilesAttached(files: Artifact[]) {
        this.contextMethods.addPendingFiles(files);
    }

    async onMessage(messages: ClientMessage[]) {
        await this.queue.enqueue(async () => {
            console.debug('Messages received from backend', messages);

            // Check for messages with verbal conversation flag
            const userHandle = this.contextMethods.handles.find(h => h.handle === '@user');
            for (const message of messages) {
                const rootPost = this.messageContext.messages.find(m => message.props?.["root-id"] === m.id)

                if (rootPost?.props?.verbalConversation === true && message.user_id !== userHandle?.id && message.message?.length > 0) {
                    try {
                        // Parse SSML and split into segments
                        const ssmlRegex = /<speak>(.*?)<\/speak>/s;
                        const ssmlMatch = message.message.match(ssmlRegex);
                        let textContent = ssmlMatch ? ssmlMatch[1] : message.message;
                        
                        // Strip markdown formatting
                        textContent = textContent
                            .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
                            .replace(/(\*|_)(.*?)\1/g, '$2')     // italic
                            .replace(/~~(.*?)~~/g, '$1')         // strikethrough
                            .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // inline code
                            .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // links
                            .replace(/^#+\s+(.*)/gm, '$1')       // headers
                            .replace(/\n\s*\n/g, '\n')           // extra newlines
                            .replace(/!\[.*?\]\(.*?\)/g, '');    // images
                        
                        // Remove emojis
                        textContent = textContent.replace(
                            /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, 
                            ''
                        );

                        // Split into segments based on SSML tags or punctuation
                        const segments = [];
                        let currentText = '';
                        let inTag = false;
                        let tagContent = '';
                        
                        for (let i = 0; i < textContent.length; i++) {
                            const char = textContent[i];
                            if (char === '<') {
                                inTag = true;
                                if (currentText.trim()) {
                                    segments.push({type: 'text', content: currentText.trim()});
                                    currentText = '';
                                }
                                continue;
                            }
                            if (char === '>') {
                                inTag = false;
                                segments.push({type: 'tag', content: tagContent});
                                tagContent = '';
                                continue;
                            }
                            if (inTag) {
                                tagContent += char;
                            } else {
                                currentText += char;
                            }
                        }
                        if (currentText.trim()) {
                            segments.push({type: 'text', content: currentText.trim()});
                        }

                        // Process each segment
                        for (const segment of segments) {
                            if (segment.type === 'text') {
                                // Create audio context and stream
                                const audioContext = new AudioContext();
                                const mediaStreamDestination = audioContext.createMediaStreamDestination();
                                const audioElement = new Audio();
                                audioElement.srcObject = mediaStreamDestination.stream;
                                
                                const wav = await tts.predict({
                                    voiceId: 'en_US-ryan-high',
                                    text: segment.content
                                });

                                const audio = new Audio();
                                audio.src = URL.createObjectURL(wav);
                                await audio.play();
                            } else if (segment.type === 'tag') {
                                // Handle SSML tags
                                const tagMatch = segment.content.match(/break\s+time="(\d+)(ms|s)"/);
                                if (tagMatch) {
                                    const duration = parseInt(tagMatch[1]);
                                    const unit = tagMatch[2];
                                    const pauseDuration = unit === 's' ? duration * 1000 : duration;
                                    await new Promise(resolve => setTimeout(resolve, pauseDuration));
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error playing TTS:', error);
                    }
                }
            }

            // Find the latest message from a different channel/thread or not the current thread root
            const latestMessage = messages
                .filter(message =>
                    message.channel_id !== this.messageContext.currentChannelId ||
                    (message.channel_id === this.messageContext.currentChannelId &&
                        message.thread_id !== this.messageContext.currentThreadId &&
                        message.id !== this.messageContext.currentThreadId)
                )
                .sort((a, b) => b.create_at - a.create_at)[0];

            if (latestMessage) {
                const channelName = this.channelContext.channels.find(c => c.id === latestMessage.channel_id)?.name || 'a channel';
                this.snackbarContext.showSnackbar({
                    message: `New message in ${channelName}`,
                    severity: 'info',
                    persist: true,
                    onClick: () => {
                        this.messageContext.setCurrentChannelId(latestMessage.channel_id);
                        this.messageContext.setCurrentThreadId(latestMessage.thread_id || null);
                        this.messageContext.markMessageRead(latestMessage.props?.["root-id"]);
                    }
                });
                
            };

            // Track unread messages
            for (const message of messages) {
                if (message.channel_id !== this.messageContext.currentChannelId ||
                    (message.thread_id && message.thread_id !== this.messageContext.currentThreadId)) {
                    if (latestMessage.props?.["root-id"])        {
                        this.messageContext.setUnreadChildren((prev) => (new Set([
                            ...prev||[],
                            latestMessage.props!["root-id"]
                        ])));
                    }
                }
            }

            // Get all unique artifact IDs from messages
            const artifactIds : UUID[] = messages.flatMap(m => m.props?.artifactIds || []).filter(a => !!a);
                
            if (artifactIds.length > 0) {
                this.artifactProvider.updateSpecificArtifacts(artifactIds);
            }

            // Update messages directly in context, checking update_at timestamps
            this.messageContext.setMessages(prev => {
                const updatedMessages = prev.map(prevMessage => {
                    const newMessage = messages.find(m => m.id === prevMessage.id);
                    if (newMessage) {
                        // Only update if the new message is more recent
                        if (!prevMessage.props?.update_at || 
                            (newMessage.props?.update_at && newMessage.props?.update_at > prevMessage.props?.update_at)) {
                            return newMessage;
                        }
                    }
                    return prevMessage;
                });

                // Add any new messages that weren't in the previous list
                const newMessages = messages.filter(newMessage => 
                    !prev.some(prevMessage => prevMessage.id === newMessage.id)
                );

                return [...updatedMessages, ...newMessages].sort((a, b) => a.create_at - b.create_at);
            });
        });
    }

    onLogUpdate(update: LogParam) {
        if (update.type === 'llm') {
            const llmLogEntry = update.entry as LLMLogEntry;
            this.llmLogContext.addLogEntry(llmLogEntry);
            return;
        }
        if (update.type === 'system') {
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

    async onBackendStatus(status: BackendStatus) {
        this.contextMethods.setNeedsConfig(!status.configured);
        this.contextMethods.setConfigError(status.message);
        this.contextMethods.setPaths({ appPath: status.appPath, modelsPath: status.modelPath} );

        if (status.configured) {
            await this.initializeTTS(status.appPath);
        }
    }

    async initializeTTS(appPath: string) {
        const settings = await this.ipcService.getRPC().getSettings();
        const snackBar = this.snackbarContext;
    
        if (settings.tts.enabled) {
            try {
                const stored = await tts.stored();
                if (!stored.includes(settings.tts.voiceId)) {
                    await tts.download(settings.tts.voiceId, (progress) => {
                        snackBar.showSnackbar({
                            message: `Downloading ${progress.url} - ${Math.round(progress.loaded * 100 / progress.total)}%`,
                            percentComplete: progress.loaded * 100 / progress.total
                        });
                    });
                }
            } catch (error) {
                throw error;
            }
        }
    }

    onTaskUpdate(task: Task, type: TaskEventType) {
        // console.log(`Task ${type} event occured`, task);
        this.tasksContext.replaceTask(task);
    }

    onProjectUpdate(project) {
        console.log('project update not handled yet');
    }

    onChannelCreated(channel: ChannelData) {
        // Add the new channel to the list and refresh
        this.channelContext.fetchChannels();
    }

    onAutoUpdate(update: { status: UpdateStatus, progress?: number }) {
        this.snackbarContext.setUpdateStatus(update.status, update.progress);
    }
}

export const useClientMethods = (ipcService: BaseRPCService, 
        snackbarContext: SnackbarContextType, 
        contextMethods: DataContextMethods,
        llmLogContext: LLMLogContextType,
        messageContext: MessageContextType,
        artifactProvider: ArtifactContextType,
        channelContext: ChannelContextType,
        taskContext: TaskContextType
    ) => {
    return new ClientMethodsImplementation(
        ipcService, 
        snackbarContext, 
        contextMethods, 
        llmLogContext,
        messageContext, 
        artifactProvider, 
        channelContext, 
        taskContext
    );
};
