import { ChatPost } from "src/chat/chatClient";
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from "src/chat/inMemoryChatClient";
import { PROJECTS_CHANNEL_ID } from "src/helpers/config";
import { formatMarkdownForTerminal } from "src/helpers/formatters";
import Logger from "src/helpers/logger";
import blessed, { input } from 'blessed';
import { artifactList, taskList, chatBox, inputBox, channelList, threadList, artifactDetailViewer, globalArtifactList, globalArtifactViewer, logBox, tab1Box, tabContainer, artifactTypeFilter, tab3Box, taskDetailViewer, screen, splashBox, startSplashAnimation, commandList } from "./ui";
import { ArtifactManager } from "src/tools/artifactManager";
import { screen } from './ui'
import { Task, TaskManager } from "src/tools/taskManager";
import { Artifact } from "src/tools/artifact";

// Available commands for autocomplete
const COMMANDS = [
    { command: '/artifacts', description: 'List artifacts in current thread' },
    { command: '/tasks', description: 'List tasks in current thread' },
    { command: '/retry', description: 'Retry last message' },
    { command: '/channel', description: 'Send message to channel root' }
];

export async function setupUserAgent(storage: InMemoryChatStorage, chatBox: blessed.Widgets.Log, inputBox: blessed.Widgets.TextboxElement, artifactManager: ArtifactManager, taskManager: TaskManager) {
    // Show splash screen with animation
    splashBox.show();
    screen.render();
    
    // Start animation
    const animation = startSplashAnimation();
    
    // Hide splash and stop animation after 3 seconds
    setTimeout(() => {
        clearInterval(animation);
        splashBox.hide();
        screen.render();
    }, 3000);

    const USER_ID = "test";
    const UserClient = new InMemoryTestClient(USER_ID, "test", storage);
    let tasks: Task[] = [];
    let taskIds: string[] = [];
    let artifacts: Artifact[] = [];

    let currentThreadId: string | null = null;
    let currentChannelId: string | null = null;
    let threadIds: string[] = [];

    // Function to load messages from a specific thread
    async function loadMessagesForThread(threadId: string | null) {
        chatBox.setContent("");
        const posts = storage.posts.filter(post => post.channel_id === currentChannelId && (post.getRootId() === threadId || post.id === threadId || (threadId === null && !post.getRootId())));

        for (const post of posts) {
            const handleName = storage.getHandleNameForUserId(post.user_id);
            const displayName = handleName ? `{bold}{red-fg}${handleName}{/red-fg}{/bold}` : `{bold}{red-fg}${post.user_id}{/red-fg}{/bold}`;

            // Determine the color for user and other users
            const messageColor = (USER_ID === post.user_id) ? "{green-fg}" : "{red-fg}";

            chatBox.log(`${displayName}: [${post.getRootId()}/${post.id}] ${formatMarkdownForTerminal(blessed.escape(post.message))}\n`);
        }
        chatBox.setScrollPerc(100);
    }

    async function refreshLists(channelId: string | null, threadId: string | null) {
        if (channelId) {
            const threads = Array.from(new Set(storage.posts.filter(post => post.channel_id === channelId).map(post => post.getRootId())))
                .filter(threadId => !!threadId); // Filter out null or undefined values

            let items: { content: string, threadId: string }[] = [];

            // Add "(root)" entry for the main channel messages
            items.push({ content: "(root)", threadId: null });

            for (const thread of threads) {
                const rootPost = storage.posts.find(post => post.getRootId() === thread && !post.parent_post_id);
                if (!rootPost) continue; // Skip if no root post is found

                // Fetch the display name for the user who created the root message
                const handleName = storage.getHandleNameForUserId(rootPost.user_id);

                // Format the root message content
                const formattedMessage = rootPost.message;

                items.push({
                    content: `${handleName}: ${formattedMessage}`,
                    threadId: thread.toString()
                });
            }

            // Update the threadList with new items
            threadList.setItems(items.map(item => item.content.slice(0, 30)));
            // Store the corresponding threadIds in a separate array for later use
            threadIds = items.map(item => item.threadId);

        } else {
            // Fetch the channel names from storage
            const items = Object.values(storage.channelNames);
            channelList.setItems(items);
        }
        screen.render();
    }

    // Populate the channel list with available channels
    await refreshLists(null, null);
    await refreshLists(PROJECTS_CHANNEL_ID, null);

    channelList.on('select', async (item, index) => {
        await pickChannel(item, index);
    });

    async function pickChannel(item, index) {
        const selectedChannelId = Object.keys(storage.channelNames)[index];
        if (!selectedChannelId) return;

        currentChannelId = selectedChannelId;

        // Load main channel messages
        await loadMessagesForThread(null);

        // Populate the thread list with threads under the selected channel and "(root)" entry
        await refreshLists(selectedChannelId, null);
    }

    // Attach an event listener to handle thread selection
    threadList.on('select', async (item, index) => {
        const selectedThreadIdStr = threadIds[index];

        if (selectedThreadIdStr === null) {
            // Switch back to viewing main channel messages
            await loadMessagesForThread(null);
            currentThreadId = null;
        } else {
            currentThreadId = selectedThreadIdStr;
            await loadMessagesForThread(currentThreadId);
            await loadTasksAndArtifacts();
        }
    });

    // Handle input changes for command and user handle autocomplete
    inputBox.on('keypress', (ch, key) => {
        const currentInput = inputBox.getValue() + (ch || '');
        
        if (currentInput.startsWith('/')) {
            // Filter commands based on current input
            const filtered = COMMANDS.filter(cmd => 
                cmd.command.toLowerCase().startsWith(currentInput.toLowerCase()));
            
            if (filtered.length > 0) {
                commandList.setItems(filtered.map(cmd => `${cmd.command} - ${cmd.description}`));
                commandList.show();
                
                // If Enter is pressed, autocomplete with the first match
                if ((key && key.name === 'enter') || ch === '\r') {
                    inputBox.setValue(filtered[0].command + ' ');
                    commandList.hide();
                    return false; // Prevent default Enter behavior
                }
                screen.render();
            } else {
                commandList.hide();
                screen.render();
            }
        } else if (currentInput.includes('@')) {
            // Get the partial handle after the @ symbol
            const parts = currentInput.split('@');
            const partial = parts[parts.length - 1].toLowerCase();
            
            // Get all user handles
            const handles = Object.entries(storage.userIdToHandleName)
                .map(([userId, handle]) => ({
                    userId,
                    handle
                }))
                .filter(user => user.handle.toLowerCase().includes(partial));
            
            if (handles.length > 0) {
                commandList.setItems(handles.map(user => user.handle));
                commandList.show();
                
                // If Enter is pressed, autocomplete with the first match
                if ((key && key.name === 'enter') || ch === '\r') {
                    // Replace the partial handle with the complete one
                    const beforeHandle = currentInput.substring(0, currentInput.lastIndexOf('@'));
                    inputBox.setValue(beforeHandle + handles[0].handle + ' ');
                    commandList.hide();
                    return false; // Prevent default Enter behavior
                }
                screen.render();
            } else {
                commandList.hide();
                screen.render();
            }
        } else {
            commandList.hide();
            screen.render();
        }
    });

    // Handle command and user handle selection
    commandList.on('select', (item) => {
        const content = item.content;
        if (content.startsWith('@')) {
            // For user handles, insert at cursor position
            const currentValue = inputBox.getValue();
            const cursorPos = inputBox.getValue().length; // Get cursor position
            const newValue = currentValue.slice(0, cursorPos - 1) + content + ' ' + currentValue.slice(cursorPos);
            inputBox.setValue(newValue);
        } else {
            // For commands, replace entire input
            const command = content.split(' - ')[0];
            inputBox.setValue(command + ' ');
        }
        commandList.hide();
        inputBox.focus();
        screen.render();
    });

    inputBox.key(['C-s'], async (ch, key) => {
        const message = inputBox.getValue().trim();

        if (!message) {
            Logger.info("Message cannot be empty.");
            inputBox.setValue('');
            inputBox.focus();
            return;
        }

        if (message === "/artifacts") {
            await loadArtifacts();
            return;
        }

        if (message === "/tasks") {
            await loadTasks();
            return;
        }

        if (message === "/retry") {
            const lastMessage = getLastUserMessage();
            if (lastMessage) {
                await sendMessage(lastMessage);
            } else {
                Logger.info("No previous message to retry.");
            }
            return;
        }

        await sendMessage(message);

        inputBox.setValue('');
        inputBox.focus();
    });

    function getLastUserMessage(): string | null {
        const posts = storage.posts.filter(post =>
            post.channel_id === currentChannelId &&
            (post.getRootId() === currentThreadId || post.id === currentThreadId || (currentThreadId === null && !post.getRootId())) &&
            post.user_id === USER_ID
        );

        if (posts.length === 0) return null;
        return posts[posts.length - 1].message;
    }

    async function sendMessage(message: string) {
        try {
            const isChannelMessage = message.toLowerCase().startsWith('/channel');
            const actualMessage = isChannelMessage ? message.slice(8).trim() : message;

            if (!actualMessage) {
                Logger.info("Message cannot be empty.");
                inputBox.setValue('');
                inputBox.focus();
                return;
            }

            // Determine if this is a channel-level message or not
            const threadId = isChannelMessage ? null : currentThreadId;
            const channelId = currentChannelId || PROJECTS_CHANNEL_ID;

            if (threadId) {
                await UserClient.postReply(threadId, channelId, actualMessage);
            } else {
                await UserClient.postInChannel(channelId, actualMessage)
            }

            Logger.info(`Message sent successfully: ${actualMessage.slice(0, 20)}...`);

            if (isChannelMessage) {
                currentThreadId = null;
                threadList.select(0);
            }

            await loadMessagesForThread(currentThreadId);
        } catch (error) {
            Logger.error('Error sending message:', error);
        }
    }

    UserClient.receiveMessages(async (post: ChatPost) => {
        // Get the channel ID and user ID
        const channelId = post.channel_id;
        const userId = post.user_id;

        if (channelId === currentChannelId && userId !== USER_ID) {
            // Retrieve the handle name for the user
            const handleName = storage.getHandleNameForUserId(userId);
            const displayName = handleName ? `{bold}{red-fg}${handleName}{/red-fg}{/bold}` : `{bold}{red-fg}${userId}{/red-fg}{/bold}`;

            // stay in the latest thread
            if (post.getRootId()) currentThreadId = post.getRootId();
        }

        // Refresh the channel and thread lists when a new message is received
        await refreshLists(null, null);
        await refreshLists(currentChannelId, currentThreadId);

        if (currentThreadId) {
            threadList.select(threadIds.indexOf(currentThreadId));
        }

        await loadMessagesForThread(currentThreadId);

    });

    async function loadArtifacts() {
        const posts = storage.posts.filter(post => post.channel_id === currentChannelId && (post.getRootId() === currentThreadId || post.id === currentThreadId || (currentThreadId === null && !post.getRootId())));

        const artifactIds = [...new Set(posts.map(p => p.props['artifact-ids']).flat())];

        const fullArtifactList = await artifactManager.listArtifacts();
        artifacts = fullArtifactList.filter(a => artifactIds.includes(a.id));

        // Populate the list pane with artifact IDs or titles if they exist
        artifactList.setItems(artifacts.map(artifact => artifact.metadata?.title || artifact.id));

        screen.render();
    }

    async function loadTasks() {
        const posts = storage.posts.filter(post => post.channel_id === currentChannelId && (post.getRootId() === currentThreadId || post.id === currentThreadId || (currentThreadId === null && !post.getRootId())));
        const projectIds = [...new Set(posts.map(p => p.props["project-id"]).filter(id => id !== undefined))];
        let projects = [];
        tasks = [];
        for (let projectId of projectIds) {
            const project = await taskManager.getProject(projectId);
            if (!project) continue
            projects.push(project);
            tasks = [...tasks, ...Object.values(project?.tasks||{})].sort((a, b) => Number(a.complete) - Number(b.complete));
        }

        // Store task IDs in order and create display items
        taskIds = tasks.map(task => task.id);
        const displayItems = tasks.map(task => {
            let checkbox = '[ ]';  // default incomplete
            if (task.complete) {
                checkbox = '[x]';  // completed
            } else if (task.inProgress) {
                checkbox = '[~]';  // in progress (assigned but not complete)
            }
            const assignee = task.assignee ? ` (${storage.getHandleNameForUserId(task.assignee)})` : '';
            return `${checkbox} ${task.description || task.id}${assignee}`;
        });
        
        taskList.setItems(displayItems);

        screen.render();
    }

    async function loadTasksAndArtifacts() {
        await loadTasks();
        await loadArtifacts();
    }

    // Listen for task events to update UI
    taskManager.on('taskAdded', async () => {
        await loadTasks();
        screen.render();
    });

    taskManager.on('taskUpdated', async () => {
        await loadTasks(); 
        screen.render();
    });

    taskManager.on('taskAssigned', async () => {
        await loadTasks();
        screen.render();
    });

    taskManager.on('taskCompleted', async () => {
        await loadTasks();
        screen.render();
    });

    taskManager.on('taskInProgress', async () => {
        await loadTasks();
        screen.render();
    });

    artifactList.on('select', async (item, index) => {
        const selectedArtifactId = item.content;
        if (!selectedArtifactId) return;

        try {
            const artifact = artifacts.find(a => a.id === selectedArtifactId || a.metadata?.title === selectedArtifactId);

            if (artifact) {
                // Use the title if it exists, otherwise use the ID
                const contentToShow = `Title: ${artifact.metadata?.title || selectedArtifactId}\n\nContent:\n${artifact.content.toString()}`;
                Logger.info(contentToShow);
            } else {
                Logger.info('Artifact not found.');
            }
        } catch (error) {
            console.error('Error loading artifact:', error);
            Logger.info('Failed to load artifact. Please try again later.');
        }

        screen.render();
    });

    taskList.on('select', async (item, index) => {
        const selectedTaskId = taskIds[index];
        if (!selectedTaskId) return;

        try {
            const task = tasks.find(t => t.id === selectedTaskId);

            if (task) {
                const status = task.complete ? 'Completed' : (task.inProgress ? 'In Progress' : 'Not Started');
                const assignee = task.assignee ? storage.getHandleNameForUserId(task.assignee) : 'Unassigned';
                
                const contentToShow = `# ${task.title || task.id}

## Status
- **State**: ${status}
- **Assignee**: ${assignee}
${task.dependsOn ? `- **Depends On**: ${task.dependsOn}` : ''}
${task.order !== undefined ? `- **Order**: ${task.order}` : ''}

## Description
${task.description || '*No description available*'}`;

                inputBox.hide();
                taskDetailViewer.setMarkdown(contentToShow);
                taskDetailViewer.show();
                taskDetailViewer.focus();
            } else {
                Logger.info('Task not found.');
            }
        } catch (error) {
            console.error('Error loading task:', error);
            Logger.info('Failed to load task. Please try again later.');
        }

        screen.render();
    });

    await pickChannel(channelList.getItem(0), 0);

    artifactList.on('select', async (item, index) => {
        const selectedArtifactId = item.content;
        if (!selectedArtifactId) return;

        try {
            const artifact = artifacts.find(a => a.id === selectedArtifactId || a.metadata?.title === selectedArtifactId);

            if (artifact) {
                // Use the title if it exists, otherwise use the ID
                const contentToShow = `Title: ${artifact.metadata?.title || selectedArtifactId}\n\nContent:\n${artifact.content.toString()}`;

                inputBox.hide();
                artifactDetailViewer.setMarkdown(contentToShow);
                artifactDetailViewer.show();
                artifactDetailViewer.focus();
            } else {
                Logger.info('Artifact not found.');
            }
        } catch (error) {
            console.error('Error loading artifact:', error);
            Logger.info('Failed to load artifact. Please try again later.');
        }

        screen.render();
    });

    let allArtifacts : Artifact[];

    async function loadArtifactFilter() {
        // Update type filter options if needed
        const types = ['All Types', ...new Set(allArtifacts.map(a => a.type))];
        
        // Create commands object for listbar
        const commands = types.reduce((acc, type) => {
            const key = type.toLowerCase().replace(/\s+/g, '-');
            acc[key] = {
                key: type,
                callback: () => loadGlobalArtifacts(type)
            };
            return acc;
        }, {});

        artifactTypeFilter.setItems(commands);
    }

    let filteredArtifacts: Artifact[] = [];

    // Load all artifacts for global viewer
    async function loadGlobalArtifacts(filterType: string = 'All Types') {
        // Filter artifacts by type
        filteredArtifacts = filterType === 'All Types'
            ? allArtifacts
            : allArtifacts.filter(a => a.type === filterType);

        globalArtifactList.setItems(filteredArtifacts.map(artifact =>
            `${artifact.metadata?.title || artifact.id} (${artifact.type}) [${artifact.metadata?.tokenCount || '?'} tokens]`
        ));
        screen.render();
        return filteredArtifacts;
    }

    // Handle global artifact list selection
    globalArtifactList.on('select', async (item, index) => {
        const selectedArtifact = filteredArtifacts[index];

        if (selectedArtifact) {
            // Format metadata section
            const metadataSection = selectedArtifact.metadata ? 
                Object.entries(selectedArtifact.metadata)
                    .map(([key, value]) => `- **${key}**: ${value}`)
                    .join('\n') :
                '*No metadata available*';

            const contentToShow = `# ${selectedArtifact.metadata?.title || selectedArtifact.id}
Type: ${selectedArtifact.type}

## Metadata
${metadataSection}

## Content
${selectedArtifact.content.toString()}`;
            
            globalArtifactViewer.setContent(contentToShow);
            screen.render();
        }
    });

    screen.key(['escape', 'q', 'C-c'], function (ch, key) {
        if (!artifactDetailViewer.hidden || !taskDetailViewer.hidden) {
            artifactDetailViewer.hide();
            taskDetailViewer.hide();
            inputBox.setValue('');
            inputBox.show();
            inputBox.focus();
            screen.render();
        } else {
            return process.exit(0);
        }
    });

    inputBox.on("focus", () => {
        inputBox.input();
        screen.render();
    })

    tabContainer.on('menu', (key) => {
        switch (key) {
            case 'chat':
                showTab1()
                break;
            case 'log':
                showTab2()
                break;
            case 'artifacts':
                showTab3()
                break;
        }
    });

    const showTab1 = () => {
        tab1Box.show();
        logBox.hide();

        tab3Box.hide();

        screen.render();
    };


    const showTab2 = () => {
        tab1Box.hide();
        logBox.show();

        globalArtifactList.hide();
        globalArtifactViewer.hide();

        screen.render();
    };

    const showTab3 = async () => {
        tab1Box.hide();

        logBox.hide();

        // Initial load of global artifacts
        allArtifacts = await artifactManager.listArtifacts();
        await loadArtifactFilter();
        await loadGlobalArtifacts();

        tab3Box.show();

        screen.render();
    };


    // Initially show chat tab
    showTab1();


}
