import React, { useState } from 'react';
import { User, Key, Eye, EyeOff, Server, Globe, Terminal, AlertCircle, Copy } from 'lucide-react';

interface MasterCredentialsProps {
    user: {
        id: string;
        username: string;
    };
    copyToClipboard: (text: string) => void;
}

export const MasterCredentials: React.FC<MasterCredentialsProps> = ({ user, copyToClipboard }) => {
    const masterDbUser = `sql_${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const masterDbPass = `kp_${user.id.substring(0,4)}@${user.username.substring(0,3).toUpperCase()}#88`;
    const masterHost = "127.0.0.1";
    const masterPort = "3306";
    const [showMasterPass, setShowMasterPass] = useState(false);

    return (
        <div className="bg-slate-900 rounded-2xl p-1 shadow-xl overflow-hidden">
            <div className="bg-slate-800/50 p-4 border-b border-slate-700/50 flex items-center justify-between">
                 <h3 className="text-white font-bold flex items-center gap-2">
                    <Key className="w-5 h-5 text-emerald-400" />
                    Master Access Credentials
                 </h3>
                 <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
                    Use these details to connect to ALL your databases
                 </span>
            </div>
            
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-10 relative">
                 <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
                    <Terminal className="w-64 h-64 text-white" />
                 </div>

                 <div className="space-y-6 relative z-10">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
                                <Globe className="w-3 h-3" /> Hostname
                            </label>
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyToClipboard(masterHost)}>
                                <code className="text-xl font-mono font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">{masterHost}</code>
                                <Copy className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
                                <Server className="w-3 h-3" /> Port
                            </label>
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyToClipboard(masterPort)}>
                                <code className="text-xl font-mono font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">{masterPort}</code>
                                <Copy className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <h4 className="text-indigo-300 text-xs font-bold mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Important</h4>
                        <p className="text-indigo-200/70 text-xs leading-relaxed">
                            This user has full privileges (SELECT, INSERT, UPDATE, DELETE) on all databases created under your account. Do not share these credentials.
                        </p>
                    </div>
                 </div>

                 <div className="space-y-5 relative z-10">
                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3" /> Master Username
                        </label>
                        <div className="flex items-center bg-slate-950 rounded-lg border border-slate-700 focus-within:border-indigo-500 transition-colors">
                            <input 
                                type="text" 
                                readOnly 
                                value={masterDbUser} 
                                className="bg-transparent border-none text-sm font-mono text-slate-200 w-full focus:ring-0 px-4 py-3"
                            />
                            <button 
                                onClick={() => copyToClipboard(masterDbUser)} 
                                className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded-r-lg transition-colors border-l border-slate-800"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
                            <Key className="w-3 h-3" /> Master Password
                        </label>
                        <div className="flex items-center bg-slate-950 rounded-lg border border-slate-700 focus-within:border-indigo-500 transition-colors">
                            <input 
                                type={showMasterPass ? "text" : "password"} 
                                readOnly 
                                value={masterDbPass} 
                                className="bg-transparent border-none text-sm font-mono text-emerald-400 w-full focus:ring-0 px-4 py-3"
                            />
                            <button 
                                onClick={() => setShowMasterPass(!showMasterPass)} 
                                className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors border-l border-r border-slate-800"
                            >
                                {showMasterPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button 
                                onClick={() => copyToClipboard(masterDbPass)} 
                                className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded-r-lg transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                 </div>
            </div>
        </div>
    );
};
