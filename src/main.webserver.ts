import 'reflect-metadata';
import { initializeBackend } from './initializeBackend';
import { WebSocketServer } from './web/server/WebSocketServer';
import { PORT } from './helpers/config';

// Run the main function
async function main() {
    try {
        const services = await initializeBackend();
        const wsServer = new WebSocketServer(services, PORT);

        // Handle graceful shutdown
        async function shutdown() {
            console.log('Shutting down web server gracefully...');
            await wsServer.close();
            process.exit(0);
        }

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

main();
