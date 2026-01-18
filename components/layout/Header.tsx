import React from 'react';
import { User, UserRole } from '../../types';
import { Menu } from 'lucide-react';

interface HeaderProps {
  user: User;
  currentView: string;
  setSidebarOpen: (open: boolean) => void;
  onProfileClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, currentView, setSidebarOpen, onProfileClick }) => {
  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">
          {currentView.replace(/_/g, ' ')}
        </h2>
      </div>
      
      <div className="flex items-center gap-4">
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
    </header>
  );
};