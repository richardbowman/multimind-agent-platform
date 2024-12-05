import { ChatPost } from "src/chat/chatClient";
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from "src/chat/testClient";
import { PROJECTS_CHANNEL_ID } from "src/helpers/config";
import { formatMarkdownForTerminal } from "src/helpers/formatters";
import Logger from "src/helpers/logger";
import blessed, { input } from 'blessed';
import { artifactDetail, artifactList, logBox, screen, channelList, threadList } from "./ui";
import ChromaDBService from "src/llm/chromaService";
import { ArtifactManager } from "src/tools/artifactManager";

export async function setupUserAgent(storage: InMemoryChatStorage, chatBox: blessed.Widgets.Log, inputBox: blessed.Widgets.TextboxElement, artifactManager: ArtifactManager) {
    const USER_ID = "test";
    const UserClient = new InMemoryTestClient(USER_ID, "test", storage);

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
            threadList.setItems(items.map(item => item.content));
            // Store the corresponding threadIds in a separate array for later use
            threadIds = items.map(item => item.threadId);

        } else {
            const channelIds = Array.from(new Set(storage.posts.map(post => post.channel_id)))
                .filter(channelId => !!channelId); // Filter out null or undefined values

            // Fetch the channel names from storage
            const items = channelIds.map(channelId => storage.channelNames[channelId] || channelId);

            channelList.setItems(items);
        }
        screen.render();
    }

    // Populate the channel list with available channels
    await refreshLists(null, null);
    await refreshLists(PROJECTS_CHANNEL_ID, null);

    channelList.on('select', async (item, index) => {
        const channelIds = Array.from(new Set(storage.posts.map(post => post.channel_id)))
            .filter(channelId => !!channelId); // Filter out null or undefined values
        const selectedChannelId = channelIds.find(channelId => storage.channelNames[channelId] === item.content);
        if (!selectedChannelId) return;

        currentChannelId = selectedChannelId;

        // Load main channel messages
        await loadMessagesForThread(null);

        // Populate the thread list with threads under the selected channel and "(root)" entry
        await refreshLists(selectedChannelId, null);
    });

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
        }
    });

    // Render existing posts in the chatBox
    for (const post of storage.posts) {
        if (post.channel_id === PROJECTS_CHANNEL_ID) {
            const handleName = storage.getHandleNameForUserId(post.user_id);
            const displayName = handleName ? `{bold}{red-fg}${handleName}{/red-fg}{/bold}` : `{bold}{red-fg}${post.user_id}{/red-fg}{/bold}`;

            if (!post.getRootId()) currentThreadId = post.id;

            // Determine the color for user and other users
            const messageColor = (USER_ID === post.user_id) ? "{green-fg}" : "{red-fg}";

            chatBox.log(`${displayName}: [${post.getRootId()}/${post.id}] ${formatMarkdownForTerminal(blessed.escape(post.message))}\n`);
        }
    }

    inputBox.key('enter', async (ch, key) => {
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

        await sendMessage(message);

        chatBox.log(`{bold}{green-fg}You{green-fg}{/bold}: ${blessed.escape(message)}\n`);
        chatBox.setScrollPerc(100);

        inputBox.setValue('');
        inputBox.focus();
    });

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

            const post = new InMemoryPost(
                currentChannelId || PROJECTS_CHANNEL_ID,
                actualMessage,
                USER_ID,
                {
                    'root-id': threadId || null // Use currentThreadId if set, otherwise null
                }
            );

            await UserClient.pushPost(post);
            Logger.info(`Message sent successfully: ${actualMessage.slice(0, 20)}...`);

            if (isChannelMessage) {
                // If it's a channel-level message and no thread is selected, we don't need to update currentThreadId
            } else if (!currentThreadId) {
                // If this is the first message in a thread, set the currentThreadId to the post's ID
                currentThreadId = post.id;
            }

            await loadMessagesForThread(currentThreadId);
        } catch (error) {
            Logger.error('Error sending message:', error);
        }
    }

    UserClient.initializeWebSocket(async (post: ChatPost) => {
        // Get the channel ID and user ID
        const channelId = post.channel_id;
        const userId = post.user_id;

        if (channelId === currentChannelId && userId !== USER_ID) {
            // Retrieve the handle name for the user
            const handleName = storage.getHandleNameForUserId(userId);
            const displayName = handleName ? `{bold}{red-fg}${handleName}{/red-fg}{/bold}` : `{bold}{red-fg}${userId}{/red-fg}{/bold}`;

            // stay in the latest main thread
            if (!post.getRootId()) currentThreadId = post.id;

            chatBox.log(`${displayName}: [${post.getRootId()}/${post.id}] ${formatMarkdownForTerminal(blessed.escape(post.message))}\n`);
            chatBox.setScrollPerc(100);
        }

        // Refresh the channel and thread lists when a new message is received
        await refreshLists(currentChannelId, currentThreadId);
    });

    // Function to load artifacts and populate the list
    async function loadArtifacts() {
        const artifacts = await artifactManager.listArtifacts();

        logBox.hide();
        inputBox.hide();
        chatBox.hide();

        artifactList.show();
        artifactDetail.show();

        // Populate the list pane with artifact IDs
        artifactList.setItems(artifacts.map(artifact => artifact.id));
        screen.render();

        setTimeout(() => {
            artifactList.focus();
            screen.render();
        }, 500);
    }

    async function hideArtifacts() {
        artifactList.hide();
        artifactDetail.hide();

        logBox.show();
        inputBox.show();
        chatBox.show();

        screen.render();
    }

    artifactList.on('select', async (item, index) => {
        const selectedArtifactId = item.content;
        if (!selectedArtifactId) return;

        try {
            const artifact = await artifactManager.loadArtifact(selectedArtifactId, 'report');

            if (artifact) {
                artifactDetail.setContent(artifact.content.toString());
            } else {
                artifactDetail.setContent('Artifact not found.');
            }
        } catch (error) {
            console.error('Error loading artifact:', error);
            artifactDetail.setContent('Failed to load artifact. Please try again later.');
        }

        screen.render();
    });

    // Quit on Escape, q, or Control-C.
    inputBox.key(['escape'], function (ch, key) {
        if (!artifactList.hidden) {
            hideArtifacts();
            inputBox.setValue('');
            inputBox.focus();
        } else {
            return process.exit(0);
        }
    });

    // Quit on Escape, q, or Control-C.
    artifactList.key(['escape'], function (ch, key) {
        if (!artifactList.hidden) {
            hideArtifacts();
            inputBox.setValue('');
            inputBox.focus();
        } else {
            return process.exit(0);
        }
    });


    threadList.on('mousedown', async (data) => {
        threadList.focus();
    });

    channelList.on('mousedown', async (data) => {
        channelList.focus();
    });

    inputBox.on('mousedown', async (data) => {
        inputBox.focus();
        inputBox.input();
    });
}