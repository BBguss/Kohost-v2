
import React, { useState, useEffect } from 'react';
import { UserRole, User, Domain, HostingPlan, Site, Framework, FileNode } from './types';
import { MessageSquare, Loader2, AlertTriangle, RefreshCw, UserPlus, LogIn, ChevronDown } from 'lucide-react';

// API
import { api } from './services/api';

// Hooks
import { useFileSystem } from './hooks/useFileSystem';

// Components
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Card } from './components/Shared'; // Ensure Card is imported
import { CreateSite } from './components/user/CreateSite';
import { FileManager } from './components/user/FileManager';
import RealTimeTerminal from './components/user/RealtimeTerminal'; // NEW COMPONENT
import { UserDashboardHome, DatabaseManager, Billing, UserProfile, SupportCenter, HostingGuide } from './pages/UserPages';
import { AdminDashboard, PaymentQueue, UserManagement, DomainManagement, PlanManagement, AdminSupport, TunnelManager, ApacheManager } from './pages/AdminPages';

type ViewState = 'DASHBOARD' | 'CREATE_SITE' | 'FILES' | 'DATABASE' | 'BILLING' | 'PROFILE' | 'TERMINAL' | 'SUPPORT' | 'USER_GUIDE' | 'ADMIN_DASHBOARD' | 'ADMIN_USERS' | 'ADMIN_PAYMENTS' | 'ADMIN_DOMAINS' | 'ADMIN_PLANS' | 'ADMIN_SUPPORT' | 'ADMIN_TUNNELS' | 'ADMIN_APACHE' | 'ADMIN_PROFILE';

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  
  // Theme State
  const [theme, setTheme] = useState<Theme>(() => {
      return (localStorage.getItem('kp_theme') as Theme) || 'light';
  });

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Notification State
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  
  // Data State
  const [domains, setDomains] = useState<Domain[]>([]);
  const [plans, setPlans] = useState<HostingPlan[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  
  // Terminal State
  const [terminalSiteId, setTerminalSiteId] = useState<string>('');

  // Hooks
  const { fetchFiles, uploadFile, renameFile, deleteFile, createFolder } = useFileSystem(sites);
  // Removed useTerminal hook as we use RealTimeTerminal now

  // Initial Load
  useEffect(() => {
    init();
  }, []);

  // Sync Theme
  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('kp_theme', theme);
  }, [theme]);

  useEffect(() => {
      if (user && user.theme) {
          setTheme(user.theme as Theme);
      }
  }, [user]);

  const toggleTheme = async () => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
      if (user) {
          try {
              setUser({ ...user, theme: newTheme });
              await api.auth.updateProfile(user.id, { theme: newTheme });
          } catch (e) {
              console.error("Failed to persist theme preference", e);
          }
      }
  };

  // --- NOTIFICATION LOGIC ---
  useEffect(() => {
    if (!user) return;

    const checkDataNotifications = async () => {
        if (user.role === UserRole.ADMIN) {
            try {
                const [payments, tickets] = await Promise.all([
                    api.admin.getPayments(),
                    api.tickets.list()
                ]);

                const hasPendingPayments = payments.some(p => p.status === 'PENDING');
                const hasOpenTickets = tickets.some(t => t.status === 'OPEN');

                setNotifications(prev => ({ 
                    ...prev, 
                    'ADMIN_PAYMENTS': hasPendingPayments,
                    'ADMIN_SUPPORT': hasOpenTickets 
                }));
            } catch (e) {
                console.error("Failed to sync admin notifications", e);
            }
        } else {
            const timer = setTimeout(() => {
                 setNotifications(prev => ({ ...prev, 'BILLING': true }));
            }, 3000);
            return () => clearTimeout(timer);
        }
    };

    checkDataNotifications();
  }, [user]); 

  const init = async () => {
    setLoading(true);
    try {
      const [plansData, domainsData] = await Promise.all([
         api.common.getPlans(),
         api.common.getDomains()
      ]);
      setPlans(plansData);
      setDomains(domainsData);

      const token = localStorage.getItem('kp_token');
      if (token) {
         try {
           const userData = await api.auth.me();
           setUser(userData);
           setCurrentView(userData.role === UserRole.ADMIN ? 'ADMIN_DASHBOARD' : 'DASHBOARD');
           
           if (userData.role === UserRole.USER) {
              refreshSites(userData.id);
           }
         } catch(e) {
           localStorage.removeItem('kp_token');
           setUser(null);
         }
      }
    } catch (err) {
      console.error("Initialization Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSites = async (userId: string) => {
      const sitesData = await api.sites.list(userId);
      setSites(sitesData);
      // Set default terminal site if not set
      if (sitesData.length > 0 && !terminalSiteId) {
          setTerminalSiteId(sitesData[0].id);
      }
  }
  
  const refreshUser = async () => {
      try {
          const userData = await api.auth.me();
          setUser(userData);
      } catch (e) {
          console.error("Failed to refresh user data", e);
      }
  };

  useEffect(() => {
      if (user && user.role === UserRole.USER) {
          refreshSites(user.id).catch(console.error);
      }
  }, [user, currentView]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     setAuthError('');
     setAuthLoading(true);

     try {
       if (isRegistering) {
           await api.auth.register(authForm);
           alert("Registration successful! Please login.");
           setIsRegistering(false);
           setAuthForm({ username: '', email: '', password: '' });
       } else {
           const { user: loggedInUser, token } = await api.auth.login(authForm.username, authForm.password);
           setUser(loggedInUser);
           
           if (loggedInUser.theme) {
               setTheme(loggedInUser.theme as Theme);
           }

           if (loggedInUser.role === UserRole.USER) {
               await refreshSites(loggedInUser.id);
           }
           
           setCurrentView(loggedInUser.role === UserRole.ADMIN ? 'ADMIN_DASHBOARD' : 'DASHBOARD');
       }
     } catch (e: any) {
       setAuthError(e.message || "Authentication failed.");
     } finally {
       setAuthLoading(false);
     }
  };

  const handleLogout = () => {
    localStorage.removeItem('kp_token');
    localStorage.removeItem('kp_current_user_id');
    setUser(null);
    setSites([]);
    setNotifications({});
    setAuthForm({ username: '', email: '', password: '' });
  };

  const handleDeploySuccess = async () => {
    if (!user) return;
    await refreshSites(user.id);
    handleViewChange('FILES');
  };

  const handleViewChange = (view: ViewState) => {
      setCurrentView(view);
      if (notifications[view]) {
          setNotifications(prev => ({ ...prev, [view]: false }));
      }
  };

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
              <div className="flex flex-col items-center gap-4">
                 <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                 <p className="text-slate-500 dark:text-slate-400 font-medium">Loading KolabPanel...</p>
              </div>
          </div>
      )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors duration-300">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md space-y-8 border border-slate-200 dark:border-slate-700">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">KolabPanel</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Fullstack Hosting Simulation</p>
          </div>
          
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                <input 
                    type="text" 
                    value={authForm.username}
                    onChange={e => setAuthForm({...authForm, username: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
                    required
                />
            </div>
            
            {isRegistering && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                    <input 
                        type="email" 
                        value={authForm.email}
                        onChange={e => setAuthForm({...authForm, email: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
                        required
                    />
                </div>
            )}

            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                <input 
                    type="password" 
                    value={authForm.password}
                    onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 dark:text-white"
                    required
                />
            </div>

            {authError && <p className="text-sm text-red-500 text-center">{authError}</p>}

            <button 
                type="submit" 
                disabled={authLoading}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isRegistering ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="text-center">
              <button 
                  onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                  {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
              </button>
          </div>
          
          {!isRegistering && (
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs text-slate-500 dark:text-slate-400 space-y-2">
                  <p className="font-bold mb-2">Demo Credentials (Click to fill):</p>
                  <div 
                    onClick={() => setAuthForm({ ...authForm, username: 'demo_user', password: 'password' })}
                    className="cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 p-2 rounded transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 flex justify-between items-center group"
                  >
                    <span>User Role:</span>
                    <div className="flex gap-1">
                        <span className="font-mono bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">demo_user</span>
                        <span className="font-mono bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">password</span>
                    </div>
                  </div>
                  <div 
                    onClick={() => setAuthForm({ ...authForm, username: 'sys_admin', password: 'admin' })}
                    className="cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 p-2 rounded transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-500 flex justify-between items-center group"
                  >
                    <span>Admin Role:</span>
                    <div className="flex gap-1">
                        <span className="font-mono bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">sys_admin</span>
                        <span className="font-mono bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">admin</span>
                    </div>
                  </div>
              </div>
          )}
        </div>
      </div>
    );
  }

  // Site Selector Component for Terminal
  const TerminalSiteSelector = () => (
    <div className="relative group">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">Connect To:</label>
        <div className="relative">
          <select 
            value={terminalSiteId}
            onChange={(e) => setTerminalSiteId(e.target.value)}
            className="appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-8 py-1.5 cursor-pointer outline-none font-medium"
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.framework})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
      <Sidebar 
        user={user} 
        isOpen={isSidebarOpen} 
        setIsOpen={setSidebarOpen} 
        currentView={currentView} 
        setCurrentView={handleViewChange}
        onLogout={handleLogout}
        notifications={notifications}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
            user={user} 
            currentView={currentView} 
            setSidebarOpen={setSidebarOpen}
            onProfileClick={() => handleViewChange(user.role === UserRole.ADMIN ? 'ADMIN_PROFILE' : 'PROFILE')} 
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {currentView === 'DASHBOARD' && <UserDashboardHome user={user} sites={sites} plans={plans} onRefresh={() => refreshSites(user.id)} />}
          {currentView === 'CREATE_SITE' && <CreateSite domains={domains} onDeploy={handleDeploySuccess} user={user} sites={sites} plans={plans} onUpgrade={() => handleViewChange('BILLING')} />}
          {currentView === 'FILES' && <FileManager sites={sites} fileSystem={{}} onRename={() => {}} onDelete={() => {}} onCreateFolder={() => {}} onUpload={() => {}} />}
          
          {/* NEW REALTIME TERMINAL */}
          {currentView === 'TERMINAL' && (
              <div className="h-[calc(100vh-140px)] flex flex-col gap-4">
                  {sites.length > 0 ? (
                      <>
                        <Card title="Interactive Shell Access" action={<TerminalSiteSelector />} className="shrink-0" />
                        <div className="flex-1 min-h-0">
                            {terminalSiteId && (
                                <RealTimeTerminal 
                                    siteId={terminalSiteId} 
                                    siteName={sites.find(s => s.id === terminalSiteId)?.name || 'Unknown'} 
                                    framework={sites.find(s => s.id === terminalSiteId)?.framework || Framework.HTML}
                                />
                            )}
                        </div>
                      </>
                  ) : (
                      <Card title="Restricted Terminal">
                         <div className="text-center py-12 text-slate-500">
                            <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                            No sites available to connect. Please deploy a site first.
                         </div>
                      </Card>
                  )}
              </div>
          )}

          {currentView === 'DATABASE' && <DatabaseManager sites={sites} user={user} onRefresh={() => refreshSites(user.id)} />}
          {currentView === 'BILLING' && <Billing plans={plans} user={user} userPlanName={user.plan} />}
          {currentView === 'PROFILE' && <UserProfile user={user} onUpdate={refreshUser} theme={theme} toggleTheme={toggleTheme} />}
          {currentView === 'SUPPORT' && <SupportCenter user={user} />}
          {currentView === 'USER_GUIDE' && <HostingGuide onNavigate={handleViewChange} />}
          
          {/* Admin Routes */}
          {user.role === UserRole.ADMIN && (
              <>
                {currentView === 'ADMIN_DASHBOARD' && <AdminDashboard />}
                {currentView === 'ADMIN_USERS' && <UserManagement />}
                {currentView === 'ADMIN_PAYMENTS' && <PaymentQueue />}
                {currentView === 'ADMIN_SUPPORT' && <AdminSupport />}
                {currentView === 'ADMIN_DOMAINS' && <DomainManagement domains={domains} setDomains={setDomains} />}
                {currentView === 'ADMIN_PLANS' && <PlanManagement plans={plans} setPlans={setPlans} />}
                {currentView === 'ADMIN_TUNNELS' && <TunnelManager />}
                {currentView === 'ADMIN_APACHE' && <ApacheManager />}
                {currentView === 'ADMIN_PROFILE' && <UserProfile user={user} onUpdate={refreshUser} theme={theme} toggleTheme={toggleTheme} />}
              </>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
