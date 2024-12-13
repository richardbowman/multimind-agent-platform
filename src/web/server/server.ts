import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { WebSocketMessage } from '../shared/types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// Store connected clients
const clients = new Set<WebSocket>();

// WebSocket connection handling
wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', async (data) => {
        try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'CHAT':
                    handleChatMessage(message, ws);
                    break;
                case 'CHANNEL':
                    handleChannelMessage(message, ws);
                    break;
                case 'THREAD':
                    handleThreadMessage(message, ws);
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({ 
                type: 'ERROR', 
                payload: 'Invalid message format' 
            }));
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
    });
});

function broadcast(message: WebSocketMessage, sender?: WebSocket) {
    clients.forEach(client => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

async function handleChatMessage(message: WebSocketMessage, ws: WebSocket) {
    // TODO: Implement chat message handling
    broadcast(message, ws);
}

async function handleChannelMessage(message: WebSocketMessage, ws: WebSocket) {
    // TODO: Implement channel operations
    broadcast(message, ws);
}

async function handleThreadMessage(message: WebSocketMessage, ws: WebSocket) {
    // TODO: Implement thread operations
    broadcast(message, ws);
}

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
