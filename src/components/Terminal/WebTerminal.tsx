/**
 * ============================================
 * TERMINAL COMPONENT - React + xterm.js + Socket.IO
 * ============================================
 * 
 * Web terminal interface using xterm.js for rendering
 * and Socket.IO for real-time communication.
 * 
 * FIXED: Using socket.io-client instead of native WebSocket
 * to match backend Socket.IO server.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { io, Socket } from 'socket.io-client';
import 'xterm/css/xterm.css';
import './WebTerminal.css';

interface WebTerminalProps {
    userId: number | string;
    siteId?: number | string;
    token?: string; // JWT token for authentication
    onClose?: () => void;
}

const WebTerminal: React.FC<WebTerminalProps> = ({ userId, siteId, token, onClose }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<Terminal | null>(null);
    const fitAddon = useRef<FitAddon | null>(null);
    const socketRef = useRef<Socket | null>(null);

    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize terminal UI
    useEffect(() => {
        if (!terminalRef.current) return;

        console.log('[Terminal] Initializing xterm.js...');

        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
            theme: {
                background: '#1e1e2e',
                foreground: '#cdd6f4',
                cursor: '#f5e0dc',
                cursorAccent: '#1e1e2e',
                selectionBackground: '#45475a',
                black: '#45475a',
                red: '#f38ba8',
                green: '#a6e3a1',
                yellow: '#f9e2af',
                blue: '#89b4fa',
                magenta: '#f5c2e7',
                cyan: '#94e2d5',
                white: '#bac2de',
                brightBlack: '#585b70',
                brightRed: '#f38ba8',
                brightGreen: '#a6e3a1',
                brightYellow: '#f9e2af',
                brightBlue: '#89b4fa',
                brightMagenta: '#f5c2e7',
                brightCyan: '#94e2d5',
                brightWhite: '#a6adc8',
            },
            allowTransparency: true,
            scrollback: 1000,
            convertEol: true,
        });

        fitAddon.current = new FitAddon();
        terminal.loadAddon(fitAddon.current);
        terminal.loadAddon(new WebLinksAddon());

        terminal.open(terminalRef.current);
        fitAddon.current.fit();

        terminalInstance.current = terminal;

        // Initial message
        terminal.write('\x1b[33mConnecting to terminal...\x1b[0m\r\n');

        const handleResize = () => {
            if (fitAddon.current) {
                fitAddon.current.fit();
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            terminal.dispose();
        };
    }, []);

    // Connect Socket.IO
    useEffect(() => {
        if (!terminalInstance.current) return;

        // Get token from localStorage if not provided
        const authToken = token || localStorage.getItem('token');

        if (!authToken) {
            setError('Authentication required');
            terminalInstance.current.write('\x1b[31mError: No authentication token\x1b[0m\r\n');
            return;
        }

        // Socket.IO connection with auth
        // LOCALHOST: Use relative URL to connect through Vite proxy (which handles CORS)
        // PRODUCTION: Use VITE_API_URL from environment
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const envUrl = (import.meta as any).env?.VITE_API_URL;
        const backendUrl = isLocalhost
            ? window.location.origin  // http://localhost:3000 (Vite with proxy config)
            : (envUrl || window.location.origin);

        console.log('══════════════════════════════════════════');
        console.log('[Terminal] 🔌 Socket.IO Connection Init');
        console.log('[Terminal] Is Localhost:', isLocalhost);
        console.log('[Terminal] Backend URL:', backendUrl);
        console.log('[Terminal] Auth Token:', authToken ? '✅ Present' : '❌ Missing');
        console.log('══════════════════════════════════════════');

        const socket = io(backendUrl, {
            auth: { token: authToken },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            withCredentials: true,
            // Force direct connection, not through proxy
            path: '/socket.io/',
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
            console.log('[Terminal] Socket.IO connected! ID:', socket.id);
            setConnected(true);
            setError(null);
        });

        socket.on('connect_error', (err) => {
            console.error('[Terminal] Connection error:', err.message);
            setError('Connection failed: ' + err.message);
            terminalInstance.current?.write(`\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
        });

        socket.on('disconnect', (reason) => {
            console.log('[Terminal] Disconnected:', reason);
            setConnected(false);
            terminalInstance.current?.write('\r\n\x1b[33mDisconnected from terminal\x1b[0m\r\n');
        });

        // Terminal events from backend
        socket.on('terminal:ready', (data: { message: string; container: string }) => {
            console.log('[Terminal] Ready:', data);
            terminalInstance.current?.write(`\x1b[32m${data.message}\x1b[0m\r\n`);
        });

        socket.on('terminal:output', (data: string) => {
            console.log('[Terminal] Output received:', data.substring(0, 50));
            terminalInstance.current?.write(data);
        });

        socket.on('terminal:clear', () => {
            terminalInstance.current?.clear();
        });

        socket.on('terminal:error', (data: { message: string }) => {
            console.error('[Terminal] Error from server:', data.message);
            setError(data.message);
            terminalInstance.current?.write(`\x1b[31m${data.message}\x1b[0m\r\n`);
        });

        return () => {
            console.log('[Terminal] Cleaning up socket...');
            socket.disconnect();
        };
    }, [token]);

    // Handle terminal input
    useEffect(() => {
        if (!terminalInstance.current || !socketRef.current) return;

        let currentLine = '';

        const handleData = (data: string) => {
            const socket = socketRef.current;
            if (!socket || !socket.connected) {
                console.warn('[Terminal] Socket not connected, ignoring input');
                return;
            }

            switch (data) {
                case '\r': // Enter
                    console.log('[Terminal] Sending command:', currentLine);
                    socket.emit('terminal:command', { command: currentLine });
                    terminalInstance.current?.write('\r\n');
                    currentLine = '';
                    break;

                case '\x7f': // Backspace
                    if (currentLine.length > 0) {
                        currentLine = currentLine.slice(0, -1);
                        terminalInstance.current?.write('\b \b');
                    }
                    break;

                case '\x03': // Ctrl+C
                    socket.emit('terminal:kill');
                    currentLine = '';
                    terminalInstance.current?.write('^C\r\n$ ');
                    break;

                case '\x0c': // Ctrl+L (clear)
                    socket.emit('terminal:command', { command: 'clear' });
                    currentLine = '';
                    break;

                default:
                    if (data >= ' ' || data === '\t') {
                        currentLine += data;
                        terminalInstance.current?.write(data);
                    }
            }
        };

        const disposable = terminalInstance.current.onData(handleData);

        return () => {
            disposable.dispose();
        };
    }, [connected]);

    const handleReconnect = useCallback(() => {
        setError(null);
        if (socketRef.current) {
            socketRef.current.connect();
        }
    }, []);

    return (
        <div className="web-terminal-container">
            <div className="terminal-header">
                <div className="terminal-title">
                    <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
                    Terminal {siteId ? `- Site ${siteId}` : ''}
                </div>
                <div className="terminal-controls">
                    {!connected && (
                        <button className="terminal-btn reconnect" onClick={handleReconnect}>
                            Reconnect
                        </button>
                    )}
                    {onClose && (
                        <button className="terminal-btn close" onClick={onClose}>
                            ×
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="terminal-error">
                    {error}
                </div>
            )}

            <div
                ref={terminalRef}
                className="terminal-body"
                style={{ height: 'calc(100% - 40px)' }}
            />
        </div>
    );
};

export default WebTerminal;
