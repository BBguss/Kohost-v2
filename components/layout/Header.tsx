
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../../types';
import { Menu, Bell } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';
import { api } from '../../services/api';

interface HeaderProps {
  user: User;
  currentView: string;
  setSidebarOpen: (open: boolean) => void;
  onProfileClick: () => void;
  // Passing View Change handler to redirect from notification
  setCurrentView?: (view: any) => void; 
}

export const Header: React.FC<HeaderProps> = ({ user, currentView, setSidebarOpen, onProfileClick, setCurrentView }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  // Polling for unread count
  useEffect(() => {
      const checkNotifications = async () => {
          try {
              const data = await api.notifications.list(user.id, user.role);
              const unread = data.filter(n => !n.read).length;
              setUnreadCount(unread);
          } catch(e) {
              // silent fail
          }
      };

      checkNotifications();
      const interval = setInterval(checkNotifications, 5000); // Check every 5s
      return () => clearInterval(interval);
  }, [user.id, user.role]);

  const handleNavigate = (view: string) => {
      if (setCurrentView) {
          setCurrentView(view);
      }
  };

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0 relative z-50">
      <div className="flex items-center gap-4">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">
          {currentView.replace(/_/g, ' ')}
        </h2>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <div className="relative">
            <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-full transition-colors relative ${showNotifications ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1.5 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                )}
            </button>
        </div>

        {/* Profile */}
        <div 
          className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all flex items-center justify-center"
          onClick={onProfileClick}
          title="Go to Profile"
        >
          {user.avatar ? (
            <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-slate-600 select-none">
              {getInitials(user.username)}
            </span>
          )}
        </div>
      </div>

      {/* Notification Dropdown */}
      {showNotifications && (
          <NotificationDropdown 
              user={user} 
              onClose={() => setShowNotifications(false)} 
              onNavigate={handleNavigate}
          />
      )}
    </header>
  );
};
