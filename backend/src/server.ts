import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { handleLocationSockets } from './sockets/locationHandler';
import { handleChatSockets } from './sockets/chatHandler';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // For development, allow any origin. Restrict in production.
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

// Setup Socket.io Event Handling
io.on('connection', (socket) => {
  handleLocationSockets(io, socket);
  handleChatSockets(io, socket);
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
