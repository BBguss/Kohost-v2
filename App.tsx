import React, { useState, useEffect, useRef } from 'react';
import { UserRole, User, Domain, HostingPlan, Site, Framework, FileNode } from './types';
import { MessageSquare, Loader2, AlertTriangle, RefreshCw, UserPlus, LogIn, Mail, Lock, User as UserIcon, ArrowRight, LayoutDashboard, ShieldCheck, Zap, Globe, Key, CheckCircle, ArrowLeft, Send, Check, X, AlertOctagon, Sparkles, Server, Eye, EyeOff } from 'lucide-react';

// API
import { api } from './services/api';

// Hooks
import { useFileSystem } from './hooks/useFileSystem';

// Contexts
import { DeploymentProvider } from './contexts/DeploymentContext';

// Components
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CreateSite } from './components/user/CreateSite';
import { FileManager } from './components/user/FileManager';
import { RestrictedTerminal } from './components/user/RestrictedTerminal';
import { UserDashboardHome, DatabaseManager, Billing, UserProfile, SupportCenter, HostingGuide } from './pages/UserPages';
import { AdminDashboard, PaymentQueue, UserManagement, DomainManagement, PlanManagement, AdminSupport, TunnelManager, ApacheManager, NotificationSettings } from './pages/AdminPages';

type ViewState = 'DASHBOARD' | 'CREATE_SITE' | 'FILES' | 'DATABASE' | 'BILLING' | 'PROFILE' | 'TERMINAL' | 'SUPPORT' | 'USER_GUIDE' | 'ADMIN_DASHBOARD' | 'ADMIN_USERS' | 'ADMIN_PAYMENTS' | 'ADMIN_DOMAINS' | 'ADMIN_PLANS' | 'ADMIN_SUPPORT' | 'ADMIN_TUNNELS' | 'ADMIN_APACHE' | 'ADMIN_PROFILE' | 'ADMIN_NOTIFICATIONS';

type Theme = 'light' | 'dark';
type AuthMode = 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD';

const BackgroundFramePlayer = () => {
    const TOTAL_FRAMES = 160;
    const FPS = 60;
    const PRELOAD_BUFFER = 5;
    const PLACEHOLDER_IMAGE = '/assets/im/ezgif-frame-001.jpg'; // Frame pertama sebagai placeholder
    
    const [currentFrame, setCurrentFrame] = useState(1);
    const [loadedImages, setLoadedImages] = useState<Record<number, string>>({});
    const [isImageReady, setIsImageReady] = useState(false);
    const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
    
    const intervalRef = useRef<number | null>(null);
    const imageCacheRef = useRef<Record<number, HTMLImageElement>>({});

    const pad3 = (n: number) => String(n).padStart(3, '0');
    
    const getImageUrl = (frame: number) => {
        return `/assets/im/ezgif-frame-${pad3(frame)}.jpg`;
    };

    // Load placeholder image first
    useEffect(() => {
        const img = new Image();
        img.onload = () => setPlaceholderLoaded(true);
        img.src = PLACEHOLDER_IMAGE;
    }, []);

    // Preload specific frame
    const preloadFrame = (frame: number) => {
        if (imageCacheRef.current[frame] || loadedImages[frame]) return;
        
        const url = getImageUrl(frame);
        const img = new Image();
        
        img.onload = () => {
            imageCacheRef.current[frame] = img;
            setLoadedImages(prev => ({ ...prev, [frame]: url }));
        };
        
        img.onerror = () => {
            console.warn(`Failed to load frame ${frame}`);
        };
        
        img.src = url;
    };

    // Preload current and upcoming frames
    useEffect(() => {
        preloadFrame(currentFrame);
        
        for (let i = 1; i <= PRELOAD_BUFFER; i++) {
            const nextFrame = currentFrame + i > TOTAL_FRAMES 
                ? (currentFrame + i) - TOTAL_FRAMES 
                : currentFrame + i;
            preloadFrame(nextFrame);
        }
    }, [currentFrame]);

    // Check if current frame is ready
    useEffect(() => {
        setIsImageReady(!!loadedImages[currentFrame]);
    }, [currentFrame, loadedImages]);

    // Start animation timer
    useEffect(() => {
        intervalRef.current = window.setInterval(() => {
            setCurrentFrame(prev => (prev >= TOTAL_FRAMES ? 1 : prev + 1));
        }, 1000 / FPS);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const currentSrc = loadedImages[currentFrame] || '';

    return (
        <div className="absolute inset-0 z-0 overflow-hidden bg-slate-900">
            {/* Placeholder image - always visible when frame not ready */}
            {placeholderLoaded && !isImageReady && (
                <img
                    src={PLACEHOLDER_IMAGE}
                    alt="Loading"
                    className="absolute inset-0 w-full h-full object-cover"
                />
            )}
            
            {/* Fallback gray background if placeholder fails */}
            {!placeholderLoaded && !isImageReady && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
            )}
            
            {/* Main animated image */}
            {currentSrc && (
                <img
                    key={currentFrame}
                    src={currentSrc}
                    alt="Background Animation"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-100 ${
                        isImageReady ? 'opacity-100' : 'opacity-0'
                    }`}
                />
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-white/30" />
        </div>
    );
};

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
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Registration Flow State
  const [registerStep, setRegisterStep] = useState(1); // 1: Details, 2: OTP
  const [registerCode, setRegisterCode] = useState('');

  // Forgot Password State
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: Code, 3: New Pass
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Feedback Modal State (Replaces Alerts)
  const [feedback, setFeedback] = useState<{
      isOpen: boolean;
      type: 'success' | 'error';
      title: string;
      message: string;
      action?: () => void;
      actionLabel?: string;
  }>({ isOpen: false, type: 'success', title: '', message: '' });

  // Notification State
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  
  // Data State
  const [domains, setDomains] = useState<Domain[]>([]);
  const [plans, setPlans] = useState<HostingPlan[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  
  // Hooks
  const { fetchFiles, uploadFile, renameFile, deleteFile, createFolder } = useFileSystem(sites);

  // Initial Load
  useEffect(() => {
    init();
  }, []);

  // Sync Theme to HTML class and LocalStorage
  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
      } else {
          document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('kp_theme', theme);
  }, [theme]);

  // Sync Theme from User Profile when User Loads
  useEffect(() => {
      if (user && user.theme) {
          setTheme(user.theme as Theme);
      }
  }, [user]);

  const toggleTheme = async () => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
      
      // If logged in, save preference to database
      if (user) {
          try {
              // Optimistically update local user state
              setUser({ ...user, theme: newTheme });
              await api.auth.updateProfile(user.id, { theme: newTheme });
          } catch (e) {
              console.error("Failed to persist theme preference", e);
          }
      }
  };

  const closeFeedback = () => {
      setFeedback(prev => ({ ...prev, isOpen: false }));
      if (feedback.action) feedback.action();
  };

  // --- NOTIFICATION LOGIC ---
  useEffect(() => {
    if (!user) return;

    const checkDataNotifications = async () => {
        if (user.role === UserRole.ADMIN) {
            try {
                // Admin: Fetch real counts
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
            // User: Simulate a specific event
            const timer = setTimeout(() => {
                 setNotifications(prev => ({ ...prev, 'BILLING': true }));
            }, 3000);
            return () => clearTimeout(timer);
        }
    };

    checkDataNotifications();
  }, [user]); 
  // -------------------------

  const init = async () => {
    setLoading(true);
    try {
      const [plansData, domainsData] = await Promise.all([
         api.common.getPlans(),
         api.common.getDomains()
      ]);
      setPlans(plansData);
      setDomains(domainsData);

      // Check login
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
           // Token expired or invalid
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
       if (authMode === 'REGISTER') {
           if (registerStep === 1) {
               // Step 1: Verify Email Availability and Send OTP
               await api.auth.verifyRegisterEmail(authForm.email, authForm.username);
               
               setFeedback({
                   isOpen: true,
                   type: 'success',
                   title: 'Code Sent',
                   message: `We've sent a verification code to ${authForm.email}. Please check your inbox.`
               });
               
               setRegisterStep(2);
               setAuthLoading(false);
           } else {
               // Step 2: Verify Code and Create Account
               await api.auth.register({
                   ...authForm,
                   code: registerCode
               });
               
               // Success Modal
               setFeedback({
                   isOpen: true,
                   type: 'success',
                   title: 'Account Created!',
                   message: 'Your registration was successful. You can now sign in to your dashboard.',
                   actionLabel: 'Sign In Now',
                   action: () => {
                       setAuthMode('LOGIN');
                       setAuthForm({ username: '', email: '', password: '' });
                       setRegisterStep(1);
                       setRegisterCode('');
                   }
               });
               
               setAuthLoading(false);
           }
       } else if (authMode === 'LOGIN') {
           const { user: loggedInUser, token } = await api.auth.login(authForm.username, authForm.password);
           setUser(loggedInUser);
           
           // Set theme from user profile immediately on login
           if (loggedInUser.theme) {
               setTheme(loggedInUser.theme as Theme);
           }

           if (loggedInUser.role === UserRole.USER) {
               await refreshSites(loggedInUser.id);
           }
           
           setCurrentView(loggedInUser.role === UserRole.ADMIN ? 'ADMIN_DASHBOARD' : 'DASHBOARD');
           setAuthLoading(false);
       }
     } catch (e: any) {
       setAuthError(e.message || "Authentication failed.");
       setAuthLoading(false);
     }
  };

  // --- FORGOT PASSWORD HANDLERS ---
  const handleResetRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      try {
          await api.auth.initiateReset(resetEmail);
          
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Code Sent',
              message: `Check your email ${resetEmail} for the verification code.`
          });
          
          setResetStep(2);
      } catch (e: any) {
          setAuthError(e.message || "Failed to send reset code.");
      } finally {
          setAuthLoading(false);
      }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      // Client-side length check only, real validation on submit
      if (resetCode.length === 6) {
          setResetStep(3);
      } else {
          setAuthError("Please enter a valid 6-digit code.");
      }
  };

  const handleFinalReset = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      try {
          await api.auth.confirmReset(resetEmail, resetCode, newPassword);
          
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Password Changed',
              message: 'Your password has been successfully reset. Please login with your new credentials.',
              actionLabel: 'Back to Login',
              action: () => {
                  setAuthMode('LOGIN');
                  setResetStep(1);
                  setResetEmail('');
                  setResetCode('');
                  setNewPassword('');
              }
          });

      } catch (e: any) {
          setAuthError(e.message || "Failed to reset password. Code may be invalid.");
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
    setAuthMode('LOGIN');
    setRegisterStep(1);
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

  // --- MODERN LIGHT GLASS LOGIN UI (BRIGHT & WHITE) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-50 font-sans">
        
        {/* FRAME SEQUENCE BACKGROUND */}
        <BackgroundFramePlayer />

        {/* FEEDBACK MODAL */}
        {feedback.isOpen && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={closeFeedback} />
                <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
                    <div className={`h-1.5 w-full ${feedback.type === 'success' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`} />
                    <div className="p-6">
                        <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-full shrink-0 ${feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                {feedback.type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertOctagon className="w-6 h-6" />}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{feedback.title}</h3>
                                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{feedback.message}</p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button 
                                onClick={closeFeedback} 
                                className={`px-5 py-2 rounded-lg font-bold text-sm text-white shadow-md transition-all hover:scale-105 active:scale-95 ${
                                    feedback.type === 'success' 
                                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                                    : 'bg-slate-800 hover:bg-slate-700'
                                }`}
                            >
                                {feedback.actionLabel || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* MAIN CONTAINER (GLASS EFFECT - HIGH CONTRAST) */}
        <div className="relative z-20 w-full max-w-5xl mx-4 min-h-[600px] bg-clip-padding backdrop-filter backdrop-blur-lg bg-white/20 border border-white/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in fade-in slide-in-from-bottom-8 duration-700 ring-1 ring-white/30">
            
            {/* LEFT SIDE: Branding & Visuals (Vibrant Gradient) */}
            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden 
    bg-gradient-to-br from-indigo-700 via-purple-700/50 to-indigo-900/20 
    backdrop-blur-sm text-white border-r border-white/10">
                {/* Decorative Circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg border border-white/20 shadow-inner">
                            <LayoutDashboard className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-white">KolabPanel<span className="text-indigo-200">.</span></span>
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-4 drop-shadow-sm">
                        Hosting <br/>
                        <span className="text-indigo-200">Reimagined.</span>
                    </h1>
                    <p className="text-indigo-100 text-lg leading-relaxed max-w-sm drop-shadow-sm font-medium">
                        Experience the future of server management. Deploy sites, manage databases, and monitor performance with our sleek, powerful platform.
                    </p>
                </div>

                <div className="relative z-10 mt-8 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl hover:bg-white/20 transition-colors duration-300">
                        <ShieldCheck className="w-6 h-6 text-emerald-300 mb-2" />
                        <h3 className="font-bold text-white text-sm">Secure Core</h3>
                        <p className="text-xs text-indigo-100 mt-1">Enterprise-grade security standards.</p>
                    </div>
                    <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl hover:bg-white/20 transition-colors duration-300">
                        <Zap className="w-6 h-6 text-yellow-300 mb-2" />
                        <h3 className="font-bold text-white text-sm">Instant Deploy</h3>
                        <p className="text-xs text-indigo-100 mt-1">Launch stacks in seconds.</p>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: Form Interaction (High Contrast White) */}
            <div className="w-full md:w-1/2 p-8 md:p-12 bg-white/2 backdrop-blur-sm flex flex-col justify-center relative shadow-inner">
                
                <div className="w-full max-w-sm mx-auto space-y-8">
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">
                            {authMode === 'REGISTER' 
                                ? (registerStep === 2 ? 'Verify Email' : 'Create Account') 
                                : authMode === 'FORGOT_PASSWORD' ? 'Reset Password' : 'Welcome Back'}
                        </h2>
                        <p className="text-slate-600 text-sm font-medium">
                            {authMode === 'REGISTER' 
                                ? (registerStep === 2 ? `Check inbox for code.` : 'Join our community today.') 
                                : authMode === 'FORGOT_PASSWORD' ? 'Recover your account access.' : 'Sign in to continue to your dashboard.'}
                        </p>
                    </div>

                    {authMode === 'FORGOT_PASSWORD' ? (
                        // FORGOT PASSWORD FLOW
                        <div className="space-y-6">
                            {/* Steps Indicator */}
                            <div className="flex justify-between mb-4 px-1">
                                {[1, 2, 3].map(step => (
                                    <div key={step} className={`h-1.5 flex-1 rounded-full mx-1 transition-all duration-500 ${step <= resetStep ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                                ))}
                            </div>

                            {resetStep === 1 && (
                                <form onSubmit={handleResetRequest} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                                    <div className="space-y-1">
                                        <div className="relative group">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                            <input 
                                                type="email" 
                                                value={resetEmail}
                                                onChange={e => setResetEmail(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                                placeholder="Registered Email Address"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={authLoading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 transform active:scale-95">
                                        {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Code <Send className="w-4 h-4" /></>}
                                    </button>
                                </form>
                            )}

                            {resetStep === 2 && (
                                <form onSubmit={handleVerifyCode} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                                    <div className="space-y-1">
                                        <input 
                                            type="text" 
                                            value={resetCode}
                                            onChange={e => setResetCode(e.target.value)}
                                            className="w-full px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 uppercase placeholder:text-slate-300 shadow-sm"
                                            placeholder="000000"
                                            maxLength={6}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg transition-all">Verify Code</button>
                                    <button type="button" onClick={() => setResetStep(1)} className="w-full text-sm text-slate-500 hover:text-indigo-600 transition-colors">Wrong email? Go back</button>
                                </form>
                            )}

                            {resetStep === 3 && (
                                <form onSubmit={handleFinalReset} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                                    <div className="space-y-1">
                                        <div className="relative group">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                            <input 
                                                type={showResetPassword ? "text" : "password"}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                                placeholder="New Secure Password"
                                                required
                                                minLength={6}
                                                autoFocus
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowResetPassword(!showResetPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                            >
                                                {showResetPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <button type="submit" disabled={authLoading} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2">
                                        {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Reset Password <CheckCircle className="w-4 h-4" /></>}
                                    </button>
                                </form>
                            )}

                            {authError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-600 animate-in shake font-medium">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {authError}
                                </div>
                            )}

                            <button 
                                onClick={() => { setAuthMode('LOGIN'); setResetStep(1); setAuthError(''); }}
                                className="flex items-center justify-center gap-2 w-full text-slate-500 hover:text-indigo-600 text-sm font-medium transition-colors mt-4"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to Login
                            </button>
                        </div>
                    ) : (
                        // LOGIN / REGISTER FLOW
                        <>
                            <form onSubmit={handleAuthSubmit} className="space-y-5">
                                {authMode === 'REGISTER' && registerStep === 2 ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                        <p className="text-center text-sm text-slate-600">
                                            Enter the 6-digit code sent to <span className="text-indigo-600 font-bold">{authForm.email}</span>
                                        </p>
                                        <div className="space-y-1">
                                            <input 
                                                type="text" 
                                                value={registerCode}
                                                onChange={e => setRegisterCode(e.target.value)}
                                                className="w-full px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 uppercase placeholder:text-slate-300 shadow-sm"
                                                placeholder="000000"
                                                maxLength={6}
                                                required
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wide">Username</label>
                                            <div className="relative group">
                                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                                <input 
                                                    type="text" 
                                                    value={authForm.username}
                                                    onChange={e => setAuthForm({...authForm, username: e.target.value})}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                                    placeholder="Enter your username"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        
                                        {authMode === 'REGISTER' && (
                                            <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                                <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wide">Email</label>
                                                <div className="relative group">
                                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                                    <input 
                                                        type="email" 
                                                        value={authForm.email}
                                                        onChange={e => setAuthForm({...authForm, email: e.target.value})}
                                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                                        placeholder="name@example.com"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center ml-1 mb-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Password</label>
                                                {authMode === 'LOGIN' && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setAuthMode('FORGOT_PASSWORD'); setAuthError(''); }}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
                                                    >
                                                        Forgot?
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative group">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                                                <input 
                                                    type={showResetPassword ? "text" : "password"} 
                                                    value={authForm.password}
                                                    onChange={e => setAuthForm({...authForm, password: e.target.value})}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400 shadow-sm"
                                                    placeholder="••••••••"
                                                    required
                                                />
                                                <button 
                                                type="button"
                                                onClick={() => setShowResetPassword(!showResetPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                            >
                                                {showResetPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {authError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-600 animate-in shake font-medium">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        {authError}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    {authMode === 'REGISTER' && registerStep === 2 && (
                                        <button 
                                            type="button"
                                            onClick={() => { setRegisterStep(1); setAuthError(''); }}
                                            className="px-4 py-3 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 rounded-xl font-bold transition-colors shadow-sm"
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button 
                                        type="submit" 
                                        disabled={authLoading}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : authMode === 'REGISTER' ? (registerStep === 1 ? <ArrowRight className="w-5 h-5" /> : <Check className="w-5 h-5" />) : <LogIn className="w-5 h-5" />}
                                        {authMode === 'REGISTER' ? (registerStep === 1 ? 'Verify Email' : 'Complete Registration') : 'Sign In'}
                                    </button>
                                </div>
                            </form>

                            <div className="text-center pt-4">
                                <p className="text-sm text-slate-500 font-medium">
                                    {authMode === 'REGISTER' ? "Already have an account?" : "Don't have an account?"}{' '}
                                    <button 
                                        onClick={() => { 
                                            setAuthMode(authMode === 'REGISTER' ? 'LOGIN' : 'REGISTER'); 
                                            setAuthError(''); 
                                            setRegisterStep(1);
                                        }}
                                        className="text-indigo-600 font-bold hover:text-indigo-800 hover:underline transition-colors"
                                    >
                                        {authMode === 'REGISTER' ? 'Sign In' : "Register Now"}
                                    </button>
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP UI ---
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
            setCurrentView={handleViewChange}
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <DeploymentProvider>
            {currentView === 'DASHBOARD' && <UserDashboardHome user={user} sites={sites} plans={plans} onRefresh={() => refreshSites(user.id)} />}
            {currentView === 'CREATE_SITE' && <CreateSite domains={domains} onDeploy={handleDeploySuccess} user={user} sites={sites} plans={plans} onUpgrade={() => handleViewChange('BILLING')} />}
            {currentView === 'FILES' && <FileManager sites={sites} fileSystem={{}} onRename={() => {}} onDelete={() => {}} onCreateFolder={() => {}} onUpload={() => {}} />}
            {currentView === 'TERMINAL' && <RestrictedTerminal sites={sites} />}
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
                  {currentView === 'ADMIN_NOTIFICATIONS' && <NotificationSettings />}
                </>
            )}
          </DeploymentProvider>
        </main>
      </div>
    </div>
  );
};

export default App;
