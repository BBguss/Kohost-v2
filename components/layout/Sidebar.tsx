import React from 'react';
import { UserRole, User } from '../../types';
import { LayoutDashboard, Server, FolderOpen, Database, CreditCard, LogOut, FileText, Activity, Users, User as UserIcon, Globe, ShoppingBag, Terminal, ShieldCheck, X, MessageSquare, Network, Settings, BookOpen } from 'lucide-react';

interface SidebarProps {
  user: User;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  currentView: string;
  setCurrentView: (view: any) => void;
  onLogout: () => void;
  notifications: Record<string, boolean>; // New prop for notification state
}

export const Sidebar: React.FC<SidebarProps> = ({ user, isOpen, setIsOpen, currentView, setCurrentView, onLogout, notifications = {} }) => {
  
  const NavItem = ({ view, icon: Icon, label }: { view: string, icon: any, label: string }) => {
    const hasNotification = notifications[view];
    const isActive = currentView === view;

    return (
      <button 
        onClick={() => {
          setCurrentView(view);
          // On mobile, auto close sidebar on selection
          if (window.innerWidth < 768) setIsOpen(false);
        }}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group relative
          ${isActive 
            ? 'bg-indigo-600 text-white shadow-md' 
            : 'text-slate-400 hover:bg-slate-800 hover:text-white' // Always keep standard style for inactive items
          }`}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5" />
          {label}
        </div>
        
        {/* Red Dot Indicator - Only show dot, no background change */}
        {!isActive && hasNotification && (
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
      <div className="p-6 flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight">KolabPanel<span className="text-indigo-500">.</span></span>
        <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-400"><X /></button>
      </div>
      
      <nav className="px-4 space-y-2 mt-4 overflow-y-auto h-[calc(100vh-140px)] custom-scrollbar">
        {user.role === UserRole.USER ? (
          <>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 mb-2">Hosting</div>
            <NavItem view="DASHBOARD" icon={LayoutDashboard} label="Dashboard" />
            <NavItem view="CREATE_SITE" icon={Server} label="New Site" />
            <NavItem view="FILES" icon={FolderOpen} label="File Manager" />
            <NavItem view="DATABASE" icon={Database} label="Databases" />
            <NavItem view="TERMINAL" icon={Terminal} label="Terminal" />
            
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 mb-2 mt-8">Account</div>
            <NavItem view="BILLING" icon={CreditCard} label="Billing & Plans" />
            <NavItem view="USER_GUIDE" icon={BookOpen} label="Hosting Guide" />
            <NavItem view="SUPPORT" icon={MessageSquare} label="Support Center" />
            <NavItem view="PROFILE" icon={UserIcon} label="My Profile" />
          </>
        ) : (
          <>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 mb-2">Administration</div>
            <NavItem view="ADMIN_DASHBOARD" icon={Activity} label="Overview" />
            <NavItem view="ADMIN_USERS" icon={Users} label="Manage Users" />
            <NavItem view="ADMIN_PAYMENTS" icon={ShieldCheck} label="Payments" />
            <NavItem view="ADMIN_SUPPORT" icon={MessageSquare} label="Support Tickets" />
            <NavItem view="ADMIN_DOMAINS" icon={Globe} label="Manage Domains" />
            <NavItem view="ADMIN_PLANS" icon={ShoppingBag} label="Manage Plans" />
            
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 mb-2 mt-8">Configuration</div>
            <NavItem view="ADMIN_TUNNELS" icon={Network} label="Network Tunnels" />
            <NavItem view="ADMIN_APACHE" icon={Settings} label="Apache Config" />
            
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 mb-2 mt-8">System</div>
            <NavItem view="ADMIN_PROFILE" icon={UserIcon} label="My Profile" />
          </>
        )}
      </nav>

      <div className="absolute bottom-0 w-full p-4 border-t border-slate-800 bg-slate-900">
          <button onClick={onLogout} className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white w-full text-sm font-medium">
            <LogOut className="w-5 h-5" /> Logout
          </button>
      </div>
    </aside>
  );
};