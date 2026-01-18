// server/app.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { AVATAR_ROOT, PAYMENT_PROOF_PATH } = require('./config/paths');
const routes = require('./routes');

const createApp = () => {
    const app = express();
    const server = http.createServer(app);

    // Setup Socket.IO untuk Terminal
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // 1. Core Middleware
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // 2. Static File Serving
    console.log(`[Static] Serving Avatars from: ${AVATAR_ROOT}`);
    app.use('/avatars', express.static(AVATAR_ROOT));
    
    console.log(`[Static] Serving Payment Proofs from: ${PAYMENT_PROOF_PATH}`);
    app.use('/uploads/proofs', express.static(PAYMENT_PROOF_PATH));

    // 3. Handle favicon.ico to prevent 404 errors
    app.get('/favicon.ico', (req, res) => res.status(204).end());

    // 4. API Routes
    app.use('/api', routes);

    // 5. WebSocket Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication error'));
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    // 6. WebSocket Connection Handler
    const { handleTerminalConnection } = require('./controllers/terminalController');
    
    io.on('connection', (socket) => {
        console.log(`[WebSocket] User connected: ${socket.user.username} (${socket.user.role})`);
        
        // Handle terminal commands
        handleTerminalConnection(socket);
        
        socket.on('disconnect', () => {
            console.log(`[WebSocket] User disconnected: ${socket.user.username}`);
        });
    });

    // 7. Global Error Handler
    app.use((err, req, res, next) => {
        console.error('[App Error]', err.stack);
        res.status(500).json({ 
            message: 'Internal Server Error', 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    });

    // 8. 404 Handler
    app.use((req, res) => {
        res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
    });

    // Attach io to app for external access if needed
    app.set('io', io);

    return { app, server, io };
};

module.exports = createApp;