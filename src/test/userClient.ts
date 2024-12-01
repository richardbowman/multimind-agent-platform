import { ChatPost } from "src/chat/chatClient";
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from "src/chat/testClient";
import { PROJECTS_CHANNEL_ID } from "src/helpers/config";
import { formatMarkdownForTerminal } from "src/helpers/formatters";
import Logger from "src/helpers/logger";
import blessed from 'blessed';

export async function setupUserAgent(storage: InMemoryChatStorage, chatBox : blessed.Widgets.Log, inputBox : blessed.Widgets.TextboxElement) {
    const USER_ID = "test";
    const UserClient = new InMemoryTestClient(USER_ID, "test", storage);
    
    let currentThreadId: string | null = null;

    inputBox.key('enter', async (ch, key) => {
        const message = inputBox.getValue().trim();
        if (!message) {
            Logger.info("Message cannot be empty.");
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
            if (message.toLowerCase() === '/new') {
                currentThreadId = null;
                Logger.info("Starting a new conversation thread.");
                return;
            }

            const post = new InMemoryPost(
                PROJECTS_CHANNEL_ID,
                message,
                USER_ID,
                {
                    'root-id': currentThreadId
                }
            );

            await UserClient.pushPost(post);
            Logger.info(`Message sent successfully: ${message.slice(0,20)}...`);

            if (!currentThreadId) {
                // If this is the first message in a thread, set the currentThreadId to the post's ID
                currentThreadId = post.id;
            }
        } catch (error) {
            Logger.error('Error sending message:', error);
        }
    }

    UserClient.initializeWebSocket(async (post: ChatPost) => {
        // Get the channel ID and user ID
        const channelId = post.channel_id;
        const userId = post.user_id;

        if (channelId === PROJECTS_CHANNEL_ID && userId !== USER_ID) {
            // Retrieve the handle name for the user
            const handleName = storage.getHandleNameForUserId(userId);
            const displayName = handleName ? `{bold}{red-fg}${handleName}{/red-fg}{/bold}` : `{bold}{red-fg}${userId}{/red-fg}{/bold}`;

            // stay in the latest main thread
            if (!post.getRootId()) currentThreadId = post.id;

            chatBox.log(`${displayName}: [${post.getRootId()}/${post.id}] ${formatMarkdownForTerminal(blessed.escape(post.message))}\n`);
            chatBox.setScrollPerc(100);
        }
    });
}