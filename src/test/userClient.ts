import { ChatPost } from "src/chat/chatClient";
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from "src/chat/testClient";
import { PROJECTS_CHANNEL_ID } from "src/helpers/config";
import { formatMarkdownForTerminal } from "src/helpers/formatters";
import Logger from "src/helpers/logger";
import blessed from 'blessed';
import { artifactDetail, artifactList, logBox, screen, channelList, threadList } from "./ui";
import { ArtifactManager } from "src/tools/artifactManager";

export async function setupUserAgent(storage: InMemoryChatStorage, chatBox: blessed.Widgets.Log, inputBox: blessed.Widgets.TextboxElement, artifactManager: ArtifactManager) {
    const USER_ID = "test";
    const UserClient = new InMemoryTestClient(USER_ID, "test", storage);
    let artifacts = [];

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
        }
    });


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
        artifacts = await artifactManager.listArtifacts();

        logBox.hide();
        inputBox.hide();
        chatBox.hide();

        artifactList.show();
        artifactDetail.show();
        artifactList.focus();

        // Populate the list pane with artifact IDs or titles if they exist
        artifactList.setItems(artifacts.map(artifact => artifact.metadata?.title || artifact.id));
        
        screen.render();
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
            const artifact = artifacts.find(a => a.id === selectedArtifactId || a.metadata?.title === selectedArtifactId);
            
            if (artifact) {
                // Use the title if it exists, otherwise use the ID
                const contentToShow = `Title: ${artifact.metadata?.title || selectedArtifactId}\n\nContent:\n${artifact.content.toString()}`;
                artifactDetail.setContent(contentToShow);
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

    chatBox.on("mousedown", () => {
        Logger.info('Chat box clicked');
        chatBox.focus();
        screen.render();
    });

    await pickChannel(channelList.getItem(0), 0);
}