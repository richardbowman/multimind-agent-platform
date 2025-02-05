import { BackendServicesWithWindows } from "../types/BackendServices";
import { app, dialog } from 'electron';
import { ClientMethods, ServerMethods } from "../shared/RPCInterface";
import mime from 'mime';
import Logger from "../helpers/logger";
import { ChatClient, ChatPost } from "../chat/chatClient";
import { ClientMessage, ClientTask } from "src/shared/types";
import { ClientChannel } from "src/shared/types";
import { ClientThread } from "src/shared/types";
import { CreateChannelHandlerParams, CreateChannelParams } from "src/shared/channelTypes";
import { createChannelHandle } from "src/shared/channelTypes";
import { getDataPath } from "../helpers/paths";
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { ClientProject } from "src/shared/types";
import { Project, Task, TaskManager, TaskType } from "src/tools/taskManager";
import { LimitedRPCHandler } from "./LimitedRPCHandler";
import { AppUpdater } from "electron-updater";
import { createUUID, UUID } from "src/types/uuid";
import { Artifact } from "src/tools/artifact";
import ical from "ical";
import { GoalTemplate } from "src/schemas/goalTemplateSchema";
import { createChatHandle, ChatHandle, isChatHandle } from "src/types/chatHandle";
import { LLMLogEntry } from "src/llm/LLMLogger";

export class ServerRPCHandler extends LimitedRPCHandler implements ServerMethods {
    constructor(private services: BackendServicesWithWindows) {
        super(services);
    }

    async markTaskComplete(taskId: string, complete: boolean): Promise<ClientTask> {
        const task = await this.services.taskManager.completeTask(taskId);
        return {
            id: task.id,
            projectId: task.projectId,
            description: task.description,
            type: task.type,
            assignee: task.assignee,
            inProgress: task.inProgress || false,
            complete: task.complete || false,
            threadId: task.props?.threadId || null,
            createdAt: task.props?.createdAt,
            updatedAt: task.props?.updatedAt,
            dependsOn: task.dependsOn,
            props: task.props
        };
    }

    async cancelTask(taskId: string): Promise<ClientTask> {
        const task = await this.services.taskManager.cancelTask(taskId);
        return {
            id: task.id,
            projectId: task.projectId,
            description: task.description,
            type: task.type,
            assignee: task.assignee,
            inProgress: task.inProgress || false,
            complete: task.complete || false,
            threadId: task.props?.threadId || null,
            createdAt: task.props?.createdAt,
            updatedAt: task.props?.updatedAt,
            dependsOn: task.dependsOn,
            props: task.props
        };
    }

    async getProject(projectId: string): Promise<ClientProject> {
        const project = this.services.taskManager.getProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        
        // Convert to client-friendly format
        return {
            id: project.id,
            name: project.name,
            props: project.props,
            tasks: Object.values(project.tasks).map(task => ({
                id: task.id,
                description: task.description,
                projectId: task.projectId,
                type: task.type,
                assignee: task.assignee,
                status: task.status,
                inProgress: task.inProgress || false,
                complete: task.complete || false,
                threadId: task.props?.threadId || null,
                createdAt: task.props?.createdAt,
                updatedAt: task.props?.updatedAt,
                dependsOn: task.dependsOn,
                props: task.props
            })),
            metadata: project.metadata
        };
    }

    async rebuildVectorDB(): Promise<void> {
        Logger.info('Rebuilding VectorDB...');

        const _s = await this.getSettings();

        Logger.info(`Reindexing collection: ${_s.chromaCollection}`);
        await this.services.vectorDB.reindexCollection(_s.chromaCollection);

        await this.services.artifactManager.indexArtifacts(true);
        
        Logger.info('VectorDB rebuild complete');
    }

    setupClientEvents(rpc: ClientMethods, autoUpdater: AppUpdater) {
        super.setupClientEvents(rpc, autoUpdater);

        // Set up log update notifications
        this.services.llmLogger.on("log", (logEntry) => {
            rpc.onLogUpdate({
                type: 'llm',
                entry: logEntry
            });
        })

        // Set up project update notifications
        this.services.taskManager.on('projectUpdated', ({project} : {project: Project}) => {
            const clientProject = {
                id: project.id,
                name: project.name,
                props: project.props,
                tasks: Object.values<Task>(project.tasks).map(task => ({
                    id: task.id,
                    description: task.description,
                    projectId: task.projectId,
                    type: task.type,
                    status: task.status,
                    assignee: task.assignee,
                    inProgress: task.inProgress || false,
                    complete: task.complete || false,
                    threadId: task.props?.threadId || null,
                    createdAt: task.props?.createdAt,
                    updatedAt: task.props?.updatedAt,
                    dependsOn: task.dependsOn,
                    props: task.props
                })),
                metadata: project.metadata
            };
            rpc.onProjectUpdate(clientProject);
        });

        // Set up task update notifications
        this.services.taskManager.on('taskUpdated', ({task}) => {
            rpc.onTaskUpdate({
                id: task.id,
                projectId: task.projectId,
                description: task.description,
                type: task.type,
                assignee: task.assignee,
                status: task.status,
                inProgress: task.inProgress || false,
                complete: task.complete || false,
                threadId: task.metadata?.threadId || null,
                createdAt: task.metadata?.createdAt,
                updatedAt: task.metadata?.updatedAt,
                dependsOn: task.dependsOn,
                props: task.props
            });
        });

        // Set up message receiving for the user client
        // Set up channel creation notifications
        this.services.chatClient.onAddedToChannel(async (channelId, params) => {
            const channel = await this.services.chatClient.getChannelData(channelId);
            rpc.onChannelCreated({
                id: channel.id,
                name: channel.name,
                members: channel.members || [],
                projectId: channel.projectId
            });
        });

        // Set up message receiving
        this.services.chatClient.receiveMessages(async (post: ChatPost) => {
            // Get all messages to calculate reply count
            const messages = await this.services.chatClient.fetchPreviousMessages(post.channel_id, 1000);
            
            // Create the new message
            const rpcMessage = {
                id: post.id,
                channel_id: post.channel_id,
                message: post.message,
                user_id: post.user_id,
                create_at: post.create_at,
                update_at: post.update_at,
                directed_at: post.directed_at,
                props: {
                    ...post.props,
                    attachments: post.attachments?.map(attachment => ({
                        ...attachment,
                        url: `/artifacts/${attachment.id}` // Ensure proper URL
                    }))
                },
                thread_id: post.getRootId(),
                reply_count: 0 // New messages start with 0 replies
            };

            // If this is a reply, get and update the parent message
            const parentId = post.getRootId();
            if (parentId) {
                const parentMessage = messages.find(p => p.id === parentId);
                if (parentMessage) {
                    const parentReplyCount = messages.filter(p => p.getRootId() === parentId).length;
                    const parentRpcMessage = {
                        id: parentMessage.id,
                        channel_id: parentMessage.channel_id,
                        message: parentMessage.message,
                        user_id: parentMessage.user_id,
                        create_at: parentMessage.create_at,
                        update_at: parentMessage.update_at,
                        directed_at: parentMessage.directed_at,
                        props: parentMessage.props,
                        thread_id: parentMessage.getRootId(),
                        reply_count: parentReplyCount
                    };
                    // Send both the new message and updated parent
                    rpc.onMessage([rpcMessage, parentRpcMessage]);
                    return;
                }
            }
            
            // If not a reply, just send the new message
            rpc.onMessage([rpcMessage]);
        });

    }


    public setServices(services) {
        this.services = services;
    }

    async sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage> {
        // If thread_id is provided, send as reply
        if (message.thread_id) {
            return await this.services.chatClient.postReply(
                message.thread_id,
                message.channel_id!,
                message.message!,
                message.props
            );
        }
        
        // If directed_at is provided, send as direct message
        if (message.directed_at) {
            return await this.services.chatClient.postDirectMessage(
                message.directed_at,
                message.channel_id!,
                message.message!,
                message.props
            );
        }
        
        // Otherwise send as regular channel message
        return await this.services.chatClient.postInChannel(
            message.channel_id!,
            message.message!,
            message.props
        );
    }

    async getMessages({ channelId, threadId, limit }: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]> {
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId, 1000);

        let channelMessages = messages
            .filter(post => post.channel_id === channelId)
            .map(post => {
                // Count replies for this message
                const replyCount = messages.filter(p => p.getRootId() === post.id).length;

                return {
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    update_at: post.update_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId(),
                    reply_count: replyCount
                };
            })
            .slice(-(limit||100));
        return channelMessages;
    }

    async getThreads({ channelId }: { channelId: UUID }): Promise<ClientThread[]> {
        const posts = await this.services.chatClient.fetchPreviousMessages(channelId);
        const threadMap = new Map<string, any>();

        posts.forEach(post => {
            const rootId = post.getRootId();
            if (rootId) {
                // This is a reply - add to existing thread
                if (threadMap.has(rootId)) {
                    threadMap.get(rootId).replies.push({
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        update_at: post.update_at,
                        directed_at: post.directed_at,
                        props: post.props
                    });
                    // Update last_message_at if this reply is newer
                    if (Math.max(post.create_at,post.update_at||0) > threadMap.get(rootId).last_message_at) {
                        threadMap.get(rootId).last_message_at = Math.max(post.create_at,post.update_at||0);
                    }
                }
            } else {
                // This is a root message - create new thread
                threadMap.set(post.id, {
                    rootMessage: {
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        update_at: post.update_at,
                        directed_at: post.directed_at,
                        props: post.props
                    },
                    replies: [],
                    last_message_at: post.create_at,
                    channel_id: post.channel_id
                });
            }
        });

        // Convert map to array and sort by last_message_at
        return Array.from(threadMap.values())
            .sort((a, b) => b.last_message_at - a.last_message_at);
    }

    async getChannels(): Promise<ClientChannel[]> {
        if (!this.services?.chatClient) {
            throw new Error('Chat client is not initialized');
        }
        const channels = await this.services.chatClient.getChannels();
        return channels.map(channel => ({
            id: channel.id,
            name: channel.name.replace('#', ''),
            description: channel.description,
            members: channel.members || [],
            artifactIds: channel.artifactIds,
            projectId: channel.projectId,
            goalTemplate: channel.goalTemplateId
        }));
    }

    async getTasks({ channelId, threadId }: { channelId: string; threadId: string | null }): Promise<any[]> {
        // Get all posts for this channel/thread
        const posts = (await this.services.chatClient.fetchPreviousMessages(channelId, 500)).filter(post => {
            if (threadId) {
                return post.getRootId() === threadId || post.id === threadId;
            }
            return true;
        });

        const channelData = await this.services.chatClient.getChannelData(channelId);

        // Extract project IDs from posts
        const projectIds = [
            ...new Set(posts.map(p => p.props["project-ids"]||[]).flat()),
            channelData.projectId
        ].filter(id => id != undefined);
        
        // Get tasks from storage that match these project IDs and convert to ClientTask format
        const tasks = projectIds.flatMap(projectId => {
            const project = this.services.taskManager.getProject(projectId);
            if (!project) return [];
            
            return Object.values<Task>(project.tasks).map(task => ({
                id: task.id,
                description: task.description,
                projectId: task.projectId,
                type: task.type,
                assignee: task.assignee,
                inProgress: task.inProgress || false,
                complete: task.complete || false,
                threadId: task.props?.threadId || null,
                createdAt: task.props?.createdAt,
                updatedAt: task.props?.updatedAt,
                dependsOn: task.dependsOn,
                props: task.props,
                status: task.status
            } as ClientTask));
        });

        return tasks;
    }

    async getArtifacts({ channelId, threadId }: { channelId: UUID; threadId: string | null }): Promise<any[]> {
        // Get all messages for this channel/thread
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId, 1000);
        const filteredMessages = messages.filter(message => {
            if (threadId) {
                return message.getRootId() === threadId || message.id === threadId;
            }
            return true;
        });

        // Collect all artifact IDs from message metadata
        const artifactIds = filteredMessages
            .flatMap(message => message.props['artifact-ids'] || [])
            .filter((id): id is string => !!id); // Filter out undefined/null

        // Get the actual artifacts
        const allArtifacts = await this.services.artifactManager.listArtifacts();
        const artifacts = allArtifacts.filter(artifact => 
            artifactIds.includes(artifact.id)
        );

        return artifacts.map(artifact => this.processArtifactContent(artifact));
    }

    async getAllArtifacts(): Promise<any[]> {
        return (await this.services.artifactManager.listArtifacts())
            .map(artifact => this.processArtifactContent(artifact));
    }

    async deleteArtifact(artifactId: string): Promise<any[]> {
        await this.services.artifactManager.deleteArtifact(artifactId);
        return this.getAllArtifacts();
    }

    async saveArtifact(artifact: Artifact): Promise<any> {
        // Convert base64 content back to Buffer if needed
        if (artifact.metadata?.binary && typeof artifact.content === 'string') {
            artifact.content = Buffer.from(artifact.content, 'base64');
        }
        
        const savedArtifact = await this.services.artifactManager.saveArtifact(artifact);
        return this.processArtifactContent(savedArtifact);
    }

    async addArtifactToChannel(channelId: UUID, artifactId: UUID): Promise<void> {
        await this.services.chatClient.addArtifactToChannel(channelId, artifactId);
    }

    async removeArtifactFromChannel(channelId: UUID, artifactId: UUID): Promise<void> {
        await this.services.chatClient.removeArtifactFromChannel(channelId, artifactId);
    }

    async getHandles(): Promise<Array<{id: UUID; handle: ChatHandle}>> {
        const handleSet = await this.services.chatClient.getHandles();
        const handles = Object.entries(handleSet).map(([id, name]) => ({
            id: createUUID(id),
            handle: createChatHandle(name)
        }));
        return handles;
    }

    private static async mapHandles(chatClient: ChatClient, agentList: (UUID|ChatHandle)[]) : Promise<UUID[]> {
        const ids : UUID[] = [];
        const handles = await chatClient.getHandles();
        if (!handles) {
            throw new Error(`Could not get handles map`);
        }

        for(const agentRef of agentList) {
            if (isChatHandle(agentRef)) {
                // Find the agent ID that matches this handle
                const idx = Object.values(handles).findIndex((handle, index) => handle === agentRef);
                if (idx == -1) {
                    throw new Error(`Agent with handle ${agentRef} not found`);
                }
                ids.push(createUUID(Object.keys(handles)[idx]));
            } else {
                ids.push(agentRef)
            }
        } 
        
        return ids;
    }

    public static async loadGoalTemplates(): Promise<GoalTemplate[]> {
        const templatesDir = path.join(app.getAppPath(), 'dist', 'assets', 'goal-templates');

        const dir = await fsPromises.readdir(templatesDir);
        const jsonFiles = dir.filter(file => file.endsWith('.json'));

        return Promise.all(jsonFiles.map(async file => {
            const template = JSON.parse(await fsPromises.readFile(path.join(templatesDir, file), 'utf8'));
            return {
                ...template,
                id: createChannelHandle(template.id),
                supportingAgents: template.supportingAgents.map((agent: string) => createChatHandle(agent)),
                defaultResponder: template.defaultResponder ? createChatHandle(template.defaultResponder) : undefined
            };
        }));
    }
    
    async getLLMLogsPaginated({ offset, limit }: { offset: number; limit: number }): Promise<LLMLogEntry[]> {
        const logs = await this.services.llmLogger.getAllLogsPaginated(offset, limit);
        return logs;
    }

    public async loadGoalTemplates(): Promise<GoalTemplate[]> {
        return ServerRPCHandler.loadGoalTemplates();
    }

    public static async createChannelHelper(chatClient: ChatClient, taskManager: TaskManager, params: CreateChannelHandlerParams) : Promise<CreateChannelParams> {
        const templates = await this.loadGoalTemplates();
        let defaultResponder = params.defaultResponder;

        // If a goal template is specified, create a project with its tasks
        let projectId, members : ChatHandle[] = [];
        if (params.goalTemplate) {
            const template = templates.find(t => t.id === params.goalTemplate);
            if (template) {
                // Resolve agent handles to IDs
                members = [...template.supportingAgents];
                const resolvedAgents = await this.mapHandles(chatClient, members);

                // use provided goals if given, or fallback to template goal tasks
                const goalTasks = params.goalDescriptions ? params.goalDescriptions.map(goal => ({
                    description: goal,
                    type: TaskType.Goal,
                }))  : template.initialTasks.map((task, i) => ({
                    description: task.description,
                    type: TaskType.Goal,
                    category: task.type,
                    assignee: task.metadata?.agent ? resolvedAgents[i] : undefined
                }))

                // Create project with resolved agent IDs
                const project = await taskManager.createProject({
                    name: params.name,
                    tasks: goalTasks,
                    metadata: {
                        description: params.description || '',
                        tags: ["channel-goals"]
                    }
                });
                projectId = project.id;

                if (!defaultResponder && template.defaultResponder) {
                    defaultResponder = template.defaultResponder;
                }
            }
        }

        if (!defaultResponder) defaultResponder = createChatHandle('@router');
        members = [...new Set([...params.members || [], defaultResponder, ...members])];


        // Use the selected default responder or fallback to router-agent
        
        const defaultResponderId = (await this.mapHandles(chatClient, [defaultResponder]))[0];
        const memberIds = [...new Set(await this.mapHandles(chatClient, members))];

        return {
            name: params.name,
            artifactIds: params.artifactIds,
            defaultResponderId: defaultResponderId,
            projectId: projectId,
            description: params.description,
            goalTemplate: params.goalTemplate,
            isPrivate: params.isPrivate,
            members: memberIds,
        }
    }

    async createChannel(params: CreateChannelHandlerParams): Promise<string> {
        const mappedParams = await ServerRPCHandler.createChannelHelper(this.services.chatClient, this.services.taskManager, params);
        return await this.services.chatClient.createChannel(mappedParams);
    }

    async deleteChannel(channelId: UUID): Promise<void> {
        if (!this.services?.chatClient) {
            throw new Error('Chat client is not initialized');
        }
        await this.services.chatClient.deleteChannel(channelId);
    }

    async minimizeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        mainWindow.minimize();
    }

    async maximizeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }

    async closeWindow(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        mainWindow.close();
    }

    async showFileDialog(): Promise<void> {
        const mainWindow = this.services.mainWindow.getWindow();
        
        dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Documents (Markdown)', extensions: ['md'] },
                { name: 'Spreadsheet (CSV)', extensions: ['csv'] },
                { name: 'Images', extensions: ['jpg', 'png', 'gif', 'webp'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        }).then(async (result) => {
            if (!result.canceled && result.filePaths.length > 0) {
                // Convert file paths to File objects
                // Process each selected file into an artifact
                const artifacts : Artifact[] = [];
                for (const filePath of result.filePaths) {
                    const fileName = path.basename(filePath);
                    const mimeType = mime.getType(filePath) || 'application/octet-stream';
                    const fileData = await fsPromises.readFile(filePath);
                    
                    // Determine if content should be treated as binary
                    const isBinary = mimeType.startsWith('image/') || 
                                   mimeType.startsWith('audio/') ||
                                   mimeType.startsWith('video/') ||
                                   mimeType.startsWith('application/') ||
                                   mimeType === 'application/octet-stream';

                    const artifact = {
                        content: isBinary ? fileData : fileData.toString('utf8'),
                        metadata: {
                            title: fileName,
                            mimeType: mimeType,
                            size: fileData.length,
                            binary: isBinary
                        }
                    };
                    
                    artifacts.push(await this.services.artifactManager.saveArtifact(artifact));
                }
                this.clientRpc?.onFilesAttached(artifacts);
            }
        });
    }

    async openDevTools(): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            const mainWindow = this.services.mainWindow.getWindow();
            mainWindow.webContents.openDevTools();
        }
    }

    processArtifactContent(artifact: any) {
        let content = Buffer.isBuffer(artifact.content)
            ? artifact.metadata?.binary
                ? artifact.content.toString('base64')
                : artifact.content.toString('utf8')
            : artifact.content.toString();

        // Parse iCalendar content into CalendarEvent[]
        if (artifact.mimeType === 'text/calendar' || artifact.type === 'calendar') {
            try {
                const parsed = ical.parseICS(content);
                const events = Object.values(parsed)
                    .filter(event => event.type === 'VEVENT')
                    .map(event => ({
                        title: event.summary,
                        start: event.start,
                        end: event.end,
                        description: event.description,
                        location: event.location,
                        attendees: event.attendees?.map(attendee => attendee.params?.CN || attendee.val),
                        reminders: event.alarms?.map(alarm => ({
                            minutesBefore: Math.floor(alarm.trigger / 60),
                            method: alarm.action === 'EMAIL' ? 'email' : 'display'
                        }))
                    }));
                content = events;
            } catch (error) {
                console.error('Error parsing iCalendar content:', error);
            }
        }

        return { ...artifact, content };
    }

    async getExecutorTypes(): Promise<string[]> {
        try {
            // Use require.context to dynamically load executors from the executors directory
            const settings = await this.getSettings();
            const executorTypes = [...new Set(Object.values(settings.agents).flatMap(a => a.config?.executors).map(e => e?.className))];

            return executorTypes;
        } catch (error) {
            Logger.error('Failed to load executor types:', error);
            return [];
        }
    }

    async transcribeAndSendAudio({
        audioBase64,
        channelId,
        threadId,
        language
    }: {
        audioBase64: string;
        channelId: UUID;
        threadId?: UUID;
        language?: string;
    }): Promise<ClientMessage> {
        if (!channelId) {
            throw new Error('Channel ID is required');
        }
        try {
            // Create temp directory if it doesn't exist
            const tempDir = path.join(getDataPath(), 'temp');
            await fsPromises.mkdir(tempDir, { recursive: true });

            // Decode base64 to buffer
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            
            // Save the WAV file
            const audioFilePath = path.join(tempDir, `audio_${Date.now()}.wav`);
            await fsPromises.writeFile(audioFilePath, audioBuffer);

            // Transcribe audio using Whisper
            const { nodewhisper } = await import('nodejs-whisper');
            let transcription = await nodewhisper(audioFilePath, {
                modelName: 'tiny.en',
                removeWavFileAfterTranscription: true,
                withCuda: false,
                logger: Logger,
                whisperOptions: {
                    outputInText: true,
                    outputInSrt: false
                }
            });

            // Clean up transcription by removing timestamps
            transcription = transcription.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\] /g, '');

            // Send transcription as message with thread context
            const message = {
                channel_id: channelId,
                thread_id: threadId || null,
                message: transcription,
                props: {
                    'transcription': true,
                    'language': language || 'en'
                }
            };

            try {
                return await this.sendMessage(message);
            } catch (error) {
                Logger.error('Failed to send transcribed message:', error);
                throw new Error('Failed to send message');
            }
        } catch (error) {
            Logger.error('Failed to transcribe audio:', error);
            throw new Error('Audio transcription failed');
        }
    }
}
