import * as ort from 'onnxruntime-web';
import * as tts from '@mintplex-labs/piper-tts-web';
import { IPCProvider } from '../contexts/IPCContext';
import { type DataContextMethods } from '../contexts/DataContext';
import { ClientMessage } from '../../../../shared/types';
import { SnackbarContextType, useSnackbar } from '../contexts/SnackbarContext';
import { UpdateStatus } from '../../../../shared/UpdateStatus';
import { BackendStatus, ClientMethods } from '../../../../shared/RPCInterface';
import { Artifact } from '../../../../tools/artifact';
import { Task } from '../../../../tools/taskManager';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import { LogParam } from '../../../../llm/LLMLogger';
import { ChannelData } from '../../../../shared/channelTypes';


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
                            
                            // Start streaming immediately
                            const stream = await tts.predictStream({
                                voiceId: 'en_US-ryan-high',
                                text: segment.content
                            });
                            
                            // Create source and connect to destination
                            const source = audioContext.createMediaStreamSource(stream);
                            source.connect(mediaStreamDestination);
                            
                            // Play the audio
                            await audioElement.play();
                            
                            // Wait for stream to end
                            await new Promise<void>((resolve) => {
                                stream.getAudioTracks()[0].onended = () => {
                                    audioContext.close();
                                    resolve();
                                };
                            });
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
                message.channel_id !== this.contextMethods.currentChannelId ||
                (message.channel_id === this.contextMethods.currentChannelId &&
                    message.thread_id !== this.contextMethods.currentThreadId &&
                    message.id !== this.contextMethods.currentThreadId)
            )
            .sort((a, b) => b.create_at - a.create_at)[0];

        if (latestMessage) {
            const channelName = this.contextMethods.channels.find(c => c.id === latestMessage.channel_id)?.name || 'a channel';
            this.snackbarContext.showSnackbar({
                message: `New message in ${channelName}`,
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

    async onBackendStatus(status: BackendStatus) {
        this.contextMethods.setNeedsConfig(!status.configured);
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
                await tts.download(settings.tts.voiceId);
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

    onChannelCreated(channel: ChannelData) {
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
