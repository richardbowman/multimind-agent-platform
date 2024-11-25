import { MainOrchestrator } from "./orchestrator";
import { CHAT_MODEL, EMBEDDING_MODEL, ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_TOKEN, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID } from "./config";
import LMStudioService from "./llm/lmstudioService";
import ResearchAssistant from "./assistant";
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from "./chat/testClient";
import blessed from 'blessed';
import { ChatPost } from "./chat/chatClient";
import Logger from "./helpers/logger";
import { formatMarkdownForTerminal } from "./helpers/formatters";


// Create a screen object.
const screen = blessed.screen({
    smartCSR: true,
    title: 'Chat Client'
});

// Create a box to display chat messages.
const chatBox = blessed.log({
    top: 0,
    left: 0,
    width: '50%',
    height: '90%',
    content: '',
    tags: true,
    scrollable: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

// Create a box to display chat messages.
const logBox = blessed.log({
    top: 0,
    left: '50%',
    width: '50%',
    height: '90%',
    content: '',
    scrollable: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'green'
    },
    style: {
        fg: 'white',
        bg: 'gray'
    }
});

Logger.logBox = logBox;

// Create a box to enter messages.
const inputBox = blessed.textbox({
    top: '90%',
    left: 0,
    width: '100%',
    height: 'shrink',
    // content: 'test',
    keys: true,
    inputOnFocus: true,
    mouse: true,
    border: {
        type: 'line',
        fg: 'red'
    },
    style: {
        fg: 'white',
        bg: 'black'
    }
});

// Append the boxes to the screen.
screen.append(chatBox);
screen.append(logBox);
screen.append(inputBox);

// Listen for keypress events in the input box.
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
    screen.render();
});

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

// Focus on the input box.
inputBox.focus();
// Refresh the screen.
screen.render();

const lmStudioService = new LMStudioService();

// Initialize the embedding and LLaMA models
await lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
await lmStudioService.initializeLlamaModel(CHAT_MODEL);


const USER_ID = "test";

const storage = new InMemoryChatStorage();
const client = new InMemoryTestClient(ORCHESTRATOR_USER_ID, "test", storage);
const researchClient = new InMemoryTestClient(RESEARCHER_USER_ID, "test", storage);
const UserClient = new InMemoryTestClient(USER_ID, "test", storage);

let currentThreadId: string | null = null;

const researcher = new ResearchAssistant(ORCHESTRATOR_TOKEN_ID, RESEARCHER_USER_ID, researchClient, WEB_RESEARCH_CHANNEL_ID, lmStudioService);
await researcher.initialize();

const orchestrator = new MainOrchestrator(ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID, client, researcher, PROJECTS_CHANNEL_ID, lmStudioService);
await orchestrator.initialize();

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

        await client.pushPost(post);
        Logger.info("Message sent successfully:", message);

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
        // remember the thread id of the project reply
        if (post.getActivityType() === 'web-research') {
            currentThreadId = post.id;
        }
        chatBox.log(`{bold}{red-fg}${userId}{/red-fg}{/bold}: ${formatMarkdownForTerminal(blessed.escape(post.message))}\n`);
        chatBox.setScrollPerc(100);
        screen.render();
    }
});