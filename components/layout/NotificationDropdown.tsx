
import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';
import { Notification, User } from '../../types';
import { Bell, CheckCircle, Info, AlertTriangle, XCircle, Check, Loader2, ExternalLink, Trash2 } from 'lucide-react';

interface NotificationDropdownProps {
    user: User;
    onClose: () => void;
    onNavigate: (view: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ user, onClose, onNavigate }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const data = await api.notifications.list(user.id, user.role);
            // Sort by Date Desc
            setNotifications(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (e) {
            console.error("Failed to load notifications");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, [user.id]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleMarkAllRead = async () => {
        await api.notifications.markAllRead(user.id, user.role);
        setNotifications(prev => prev.map(n => ({...n, read: true})));
    };

    const handleClearAll = async () => {
        if (notifications.length === 0) return;
        setClearing(true);
        try {
            await api.notifications.clearAll(user.id, user.role);
            setNotifications([]);
        } catch (e) {
            console.error("Failed to clear notifications");
        } finally {
            setClearing(false);
        }
    };

    const handleItemClick = async (notif: Notification) => {
        if (!notif.read) {
            await api.notifications.markRead(notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? {...n, read: true} : n));
        }
        if (notif.link) {
            onNavigate(notif.link);
            onClose();
        }
    };

    const getIcon = (type: string) => {
        switch(type) {
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'ERROR': return <XCircle className="w-5 h-5 text-red-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <div ref={dropdownRef} className="absolute top-14 right-4 md:right-20 w-80 md:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Notifications</h3>
                <div className="flex items-center gap-3">
                    {notifications.some(n => !n.read) && (
                        <button 
                            onClick={handleMarkAllRead}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
                            title="Mark all as read"
                        >
                            <Check className="w-3.5 h-3.5" /> Mark read
                        </button>
                    )}
                    {notifications.length > 0 && (
                        <button 
                            onClick={handleClearAll}
                            disabled={clearing}
                            className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 font-medium flex items-center gap-1 transition-colors"
                            title="Clear all notifications"
                        >
                            {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Clear all
                        </button>
                    )}
                </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar relative">
                {loading ? (
                    <div className="py-8 flex justify-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                        <Bell className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No notifications yet.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {notifications.map(notif => (
                            <div 
                                key={notif.id} 
                                onClick={() => handleItemClick(notif)}
                                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer flex gap-3 ${!notif.read ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                            >
                                <div className={`shrink-0 mt-0.5`}>
                                    {getIcon(notif.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className={`text-sm font-semibold truncate ${!notif.read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                                            {notif.title}
                                        </h4>
                                        {!notif.read && <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0"></span>}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                                        {notif.message}
                                    </p>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(notif.createdAt).toLocaleDateString()} • {new Date(notif.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                        {notif.link && (
                                            <span className="text-[10px] flex items-center gap-1 text-indigo-500 font-medium">
                                                View <ExternalLink className="w-2.5 h-2.5" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
