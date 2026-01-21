/**
 * ============================================
 * useDatabaseSync Hook
 * ============================================
 * 
 * React hook untuk realtime database synchronization.
 * Listens untuk DATABASE_CHANGED events dari server
 * dan auto-refresh UI saat ada perubahan dari terminal.
 * 
 * PRINSIP:
 * 1. Database adalah SINGLE SOURCE OF TRUTH
 * 2. UI TIDAK cache schema - selalu fresh fetch
 * 3. Event dari terminal triggers UI refresh
 * 4. Polling fallback jika WebSocket unavailable
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Event type definitions
interface DatabaseChangedEvent {
    type: 'DATABASE_CHANGED';
    timestamp: string;
    userId: string;
    siteId?: string;
    dbName: string;
    operation: 'migrate' | 'rollback' | 'seed' | 'wipe' | 'query' | 'unknown';
    command?: string;
    schema?: {
        hash: string;
        tableCount: number;
    };
}

interface UseDatabaseSyncOptions {
    /** User ID for authentication */
    userId: string;
    /** Auth token for WebSocket connection */
    token: string;
    /** Site ID to filter events (optional) */
    siteId?: string;
    /** Callback when database changes detected */
    onDatabaseChanged?: (event: DatabaseChangedEvent) => void;
    /** Callback to refresh table list */
    onRefreshTables?: () => void;
    /** Enable polling fallback (default: true) */
    enablePolling?: boolean;
    /** Polling interval in ms (default: 30000) */
    pollingInterval?: number;
}

interface UseDatabaseSyncReturn {
    /** Whether connected to WebSocket */
    isConnected: boolean;
    /** Last received event */
    lastEvent: DatabaseChangedEvent | null;
    /** Manually trigger refresh */
    triggerRefresh: () => void;
    /** Current schema hash (for change detection) */
    schemaHash: string | null;
}

/**
 * Hook for realtime database synchronization
 * 
 * Usage:
 * ```tsx
 * const { isConnected, lastEvent, triggerRefresh } = useDatabaseSync({
 *     userId: user.id,
 *     token: authToken,
 *     siteId: selectedSite.id,
 *     onDatabaseChanged: (event) => {
 *         console.log('Database changed:', event);
 *         fetchTables(); // Refresh UI
 *     }
 * });
 * ```
 */
export const useDatabaseSync = (options: UseDatabaseSyncOptions): UseDatabaseSyncReturn => {
    const {
        userId,
        token,
        siteId,
        onDatabaseChanged,
        onRefreshTables,
        enablePolling = true,
        pollingInterval = 30000
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState<DatabaseChangedEvent | null>(null);
    const [schemaHash, setSchemaHash] = useState<string | null>(null);
    
    const socketRef = useRef<Socket | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const lastRefreshRef = useRef<number>(0);

    // Debounced refresh to prevent rapid-fire updates
    const triggerRefresh = useCallback(() => {
        const now = Date.now();
        // Debounce: minimum 1 second between refreshes
        if (now - lastRefreshRef.current < 1000) {
            console.log('[DBSync] Refresh debounced');
            return;
        }
        lastRefreshRef.current = now;
        
        console.log('[DBSync] 🔄 Triggering table refresh');
        if (onRefreshTables) {
            onRefreshTables();
        }
    }, [onRefreshTables]);

    // Handle database changed event
    const handleDatabaseChanged = useCallback((event: DatabaseChangedEvent) => {
        console.log('[DBSync] 📡 Received DATABASE_CHANGED event:', event);
        
        // Filter by siteId if specified
        if (siteId && event.siteId && event.siteId !== siteId) {
            console.log('[DBSync] Event filtered out (different siteId)');
            return;
        }
        
        setLastEvent(event);
        
        // Update schema hash if provided
        if (event.schema?.hash) {
            setSchemaHash(event.schema.hash);
        }
        
        // Call user callback
        if (onDatabaseChanged) {
            onDatabaseChanged(event);
        }
        
        // Auto-refresh tables
        triggerRefresh();
    }, [siteId, onDatabaseChanged, triggerRefresh]);

    // Initialize WebSocket connection
    useEffect(() => {
        if (!userId || !token) {
            console.log('[DBSync] Missing userId or token, skipping WebSocket');
            return;
        }

        // Use existing Socket.IO connection if available
        // Or create new one
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        
        console.log('[DBSync] 🔌 Connecting to WebSocket...');
        
        const socket = io(apiUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[DBSync] ✅ WebSocket connected');
            setIsConnected(true);
        });

        socket.on('disconnect', (reason) => {
            console.log('[DBSync] ❌ WebSocket disconnected:', reason);
            setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.warn('[DBSync] ⚠️ WebSocket connection error:', error.message);
            setIsConnected(false);
        });

        // Listen for database change events
        socket.on('database:changed', handleDatabaseChanged);

        // Also listen for general activity (for debugging)
        socket.on('database:activity', (data) => {
            console.log('[DBSync] 📊 Database activity:', data);
        });

        // Cleanup
        return () => {
            console.log('[DBSync] 🔌 Disconnecting WebSocket');
            socket.off('database:changed', handleDatabaseChanged);
            socket.off('database:activity');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [userId, token, handleDatabaseChanged]);

    // Polling fallback for when WebSocket is unavailable
    useEffect(() => {
        if (!enablePolling || isConnected) {
            // Clear polling if WebSocket is connected
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        console.log('[DBSync] 📡 Starting polling fallback (interval:', pollingInterval, 'ms)');
        
        pollingRef.current = setInterval(() => {
            console.log('[DBSync] 🔄 Polling refresh...');
            triggerRefresh();
        }, pollingInterval);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [enablePolling, isConnected, pollingInterval, triggerRefresh]);

    return {
        isConnected,
        lastEvent,
        triggerRefresh,
        schemaHash
    };
};

/**
 * Simpler hook that just provides auto-refresh on database changes
 * For components that just need to refresh when database changes
 * 
 * Usage:
 * ```tsx
 * useDatabaseAutoRefresh({
 *     userId: user.id,
 *     token: authToken,
 *     onRefresh: () => fetchTables(siteId)
 * });
 * ```
 */
export const useDatabaseAutoRefresh = (options: {
    userId: string;
    token: string;
    siteId?: string;
    onRefresh: () => void;
}) => {
    return useDatabaseSync({
        userId: options.userId,
        token: options.token,
        siteId: options.siteId,
        onRefreshTables: options.onRefresh
    });
};

export default useDatabaseSync;
