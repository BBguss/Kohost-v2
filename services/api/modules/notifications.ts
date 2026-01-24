
import { Notification } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, getAuthHeaders } from '../core';
import { delay, getStorage, setStorage, DB_KEYS } from '../../mockData';

// Helper for other modules to add notifications (MOCK ONLY FALLBACK)
export const addMockNotification = (targetUserId: string, title: string, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR', link?: string) => {
    const notifs = getStorage<Notification[]>(DB_KEYS.NOTIFICATIONS, []);
    const newNotif: Notification = {
        id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: targetUserId,
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString(),
        link
    };
    notifs.unshift(newNotif); // Add to top
    setStorage(DB_KEYS.NOTIFICATIONS, notifs);
};

export const notificationsApi = {
    list: async (userId: string, role: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/notifications?userId=${userId}&role=${role}`, {
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => {
                await delay(300);
                const allNotifs = getStorage<Notification[]>(DB_KEYS.NOTIFICATIONS, []);
                return allNotifs.filter(n => 
                    n.userId === userId || (role === 'ADMIN' && n.userId === 'ADMIN')
                );
            }
        );
    },
    markRead: async (notificationId: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => {
                await delay(200);
                const allNotifs = getStorage<Notification[]>(DB_KEYS.NOTIFICATIONS, []);
                const updated = allNotifs.map(n => n.id === notificationId ? { ...n, read: true } : n);
                setStorage(DB_KEYS.NOTIFICATIONS, updated);
                return { success: true };
            }
        );
    },
    markAllRead: async (userId: string, role: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/notifications/read-all`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ userId, role })
                });
                return handleResponse(res);
            },
            async () => {
                await delay(300);
                const allNotifs = getStorage<Notification[]>(DB_KEYS.NOTIFICATIONS, []);
                const updated = allNotifs.map(n => {
                    if (n.userId === userId || (role === 'ADMIN' && n.userId === 'ADMIN')) {
                        return { ...n, read: true };
                    }
                    return n;
                });
                setStorage(DB_KEYS.NOTIFICATIONS, updated);
                return { success: true };
            }
        );
    },
    clearAll: async (userId: string, role: string) => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/notifications/clear-all`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ userId, role })
                });
                return handleResponse(res);
            },
            async () => {
                await delay(300);
                const allNotifs = getStorage<Notification[]>(DB_KEYS.NOTIFICATIONS, []);
                // Keep notifications that DO NOT belong to the current user context
                const remaining = allNotifs.filter(n => 
                    !(n.userId === userId || (role === 'ADMIN' && n.userId === 'ADMIN'))
                );
                setStorage(DB_KEYS.NOTIFICATIONS, remaining);
                return { success: true };
            }
        );
    }
};
