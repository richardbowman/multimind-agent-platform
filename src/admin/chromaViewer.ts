import Blessed from 'blessed';
import ChromaDBService from '../llm/chromaService'; // Adjust the import path accordingly
import Logger from 'src/helpers/logger';
import { formatMarkdownForTerminal } from 'src/helpers/formatters';
import LMStudioService from 'src/llm/lmstudioService';
import { EMBEDDING_MODEL } from 'src/helpers/config';

async function runSearchTool() {
    const screen = Blessed.screen({
        smartCSR: true,
        useBCE: true,
        warnings: true,
    });

    const msgBox = Blessed.message({
        top: 'center',
        left: 'center',
        width: '30%',
        height: 'shrink',
        style: {
            fg: 'white',
            bg: 'gray'
        },
        border: {
            type: 'line'
        },
        hidden: true
    });

    Logger.logBox = Blessed.log({
        top: '80%',
        left: '50%',
        width: '50%',
        height: '20%',
        style: {
            fg: 'white',
            bg: 'gray',
            selected: {
                bg: 'red'
            }
        },
        border: {
            type: 'line'
        },
        label: 'Logs'
    });
    screen.append(Logger.logBox);

    const lmStudioService = new LMStudioService();
    // Initialize the embedding and LLaMA models
    await lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
    const chromaDBService = new ChromaDBService(lmStudioService);



    // Create a list box for collections on the left side
    const listBoxCollections = Blessed.list({
        top: 0,
        left: 0,
        width: '50%',
        height: '40%',
        mouse: true,
        style: {
            fg: 'white',
            bg: 'blue',
            selected: {
                bg: 'red'
            }
        },
        border: {
            type: 'line'
        },
        label: 'Collections'
    });

    // Create a list box for items on the left side
    const listBoxItems = Blessed.list({
        top: '40%',
        left: 0,
        width: '50%',
        height: '50%',
        mouse: true,
        style: {
            fg: 'white',
            bg: 'blue',
            selected: {
                bg: 'red'
            }
        },
        scrollbar: {
            style: {
              bg:'blue'
            },
            track: {
              bg: 'gray'
            }
          },
        border: {
            type: 'line'
        },
        label: 'Items'
    });

    // Create a text input box for Project ID filtering
    const textBoxProjectID = Blessed.textbox({
        top: '25%',
        left: 0,
        width: '50%',
        height: 'shrink',
        mouse: true,
        keys: true,
        inputOnFocus: true,
        style: {
            fg: 'black',
            bg: 'green'
        },
        border: {
            type: 'line'
        },
        label: 'Enter Project ID to filter items:'
    });

    // Create a box for document details on the right side
    const detailBox = Blessed.box({
        top: 0,
        left: '50%',
        width: '50%',
        height: '80%',
        scrollable: true,
        alwaysScroll: true,
        mouse: true,
        style: {
            fg: 'black',
            bg: 'green'
        },
        border: {
            type: 'line'
        },
        label: 'Document Details'
    });

    // Populate the collections list box with collections
    const collections = await chromaDBService.listCollections();
    listBoxCollections.setItems(collections.map(collection => collection.name));

    // Handle selection change for collections
    listBoxCollections.on('select', async (item, index) => {
        Logger.info(`Selected collection: ${item.content}`);
        textBoxProjectID.setContent('');
        listBoxItems.setContent('');
        detailBox.setContent('');

        if (!await chromaDBService.hasCollection(item.content)) {
            await chromaDBService.initializeCollection(item.content);
        }

        const items = await chromaDBService.getItems();

        // Extract the title from each item's metadata
        const itemTitles = items.metadatas.map((metadata: any, index: number) => metadata.title || items.ids[index]);

        listBoxItems.setItems(itemTitles);

        // Automatically select the first item in the list
        if (itemTitles.length > 0) {
            listBoxItems.select(0);
        }
        screen.render();
    });

    // Handle change event of text input box to filter items
    textBoxProjectID.key('enter', async () => {
        Logger.info("Filtering to ProjectID: " + textBoxProjectID.getValue());

        const projectId = textBoxProjectID.getValue().trim();
        Logger.info(`Filtering items by Project ID: ${projectId}`);

        if (!chromaDBService.collection) {
            return;
        }

        let items = await chromaDBService.collection.get({});

        // Filter items based on the Project ID
        items = items.metadatas.filter(metadata => metadata.projectId === projectId);

        const itemTitles = items.map(metadata => metadata.title);
        listBoxItems.setItems(itemTitles);

        // Automatically select the first item in the list
        if (itemTitles.length > 0) {
            listBoxItems.select(0);
        }
        screen.render();
    });

    // Handle selection change for items
    listBoxItems.on('select', async (item, index) => {
        Logger.info(`Selected item: ${item.content}`);
        detailBox.setContent('');

        if (!chromaDBService.collection) {
            return;
        }

        let items = await chromaDBService.collection.get({});

        let combined = items.metadatas.map((metadata, i) => {
            return {
                id: items.ids[i],
                metadata: metadata,
                document: items.documents[i]
            };
        });

        // Filter items based on the Project ID
        const projectId = textBoxProjectID.getValue().trim();
        if (projectId) {
            combined = combined.filter(c => c.metadata.projectId === projectId);
            Logger.info(`Filtering ${combined.length} items by Project ID: ${projectId}`);
        } else {
            Logger.info(`Displaying all items`);
        }

        const selectedItem = combined[index];

        let detailsContent = '';
        detailsContent += `Item ${index + 1}:\n`;
        detailsContent += `  ID: ${selectedItem.id}\n`;
        detailsContent += `  Metadata: ${JSON.stringify(selectedItem.metadata, null, 2)}\n`;
        detailsContent += `  Document:\n ${formatMarkdownForTerminal(selectedItem.document)}\n\n`; // Truncate for brevity

        detailBox.setContent(detailsContent);
        screen.render();
    });

    // Quit the application on pressing 'q'
    screen.key(['escape', 'q'], function (ch, key) {
        return process.exit(0);
    });

    // Append components to the screen
    screen.append(listBoxCollections);
    screen.append(textBoxProjectID);
    screen.append(listBoxItems);
    screen.append(detailBox);
    screen.append(msgBox);

    Logger.info("Up and running");

    screen.render();
}

runSearchTool().catch(console.error);
