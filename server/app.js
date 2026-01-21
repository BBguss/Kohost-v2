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

    // Setup Socket.IO untuk Terminal dengan CORS yang lebih permissive untuk development
    const io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                // Allowed origins for development and production
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:5000',
                    'http://127.0.0.1:3000',
                    'http://127.0.0.1:5000',
                    process.env.FRONTEND_URL
                ].filter(Boolean);

                // Allow requests with no origin (like Vite proxy, mobile apps, curl)
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    console.log('[Socket.IO] ❌ CORS rejected origin:', origin);
                    callback(new Error('CORS not allowed'));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true
        },
        // Explicitly enable both transports
        transports: ['websocket', 'polling']
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
        console.log('[Socket.IO] 🔐 Auth attempt from:', socket.handshake.address);
        console.log('[Socket.IO] Token present:', !!token);

        if (!token) {
            console.log('[Socket.IO] ❌ Auth failed: No token provided');
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            console.log('[Socket.IO] ✅ Auth success for user:', decoded.username);
            next();
        } catch (err) {
            console.log('[Socket.IO] ❌ Auth failed: Invalid token -', err.message);
            next(new Error('Invalid token'));
        }
    });

    // 6. WebSocket Connection Handler
    const { handleTerminalConnection } = require('./controllers/terminalController');
    
    // Register Socket.IO with database sync service for realtime updates
    let dbSyncService;
    try {
        dbSyncService = require('./services/databaseSyncService');
        dbSyncService.registerSocketIO(io);
        console.log('[Socket.IO] ✅ Database sync service registered');
    } catch (e) {
        console.warn('[Socket.IO] ⚠️ Database sync service not available:', e.message);
    }

    io.on('connection', (socket) => {
        console.log('══════════════════════════════════════════');
        console.log('[Socket.IO] ✅ NEW CONNECTION');
        console.log('[Socket.IO] Socket ID:', socket.id);
        console.log('[Socket.IO] User:', socket.user.username);
        console.log('[Socket.IO] Role:', socket.user.role);
        console.log('[Socket.IO] Transport:', socket.conn.transport.name);
        console.log('══════════════════════════════════════════');

        // Join user to their personal room for targeted events (database changes, etc.)
        const userRoom = `user_${socket.user.id}`;
        socket.join(userRoom);
        console.log(`[Socket.IO] User joined room: ${userRoom}`);

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