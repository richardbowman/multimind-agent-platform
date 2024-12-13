import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// WebSocket connection handling
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Handle incoming messages
        console.log('received: %s', message);
    });
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
