import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Activity, Server, Cpu, HardDrive, Loader2 } from 'lucide-react';

interface SystemHealthData {
    cpu: number;
    memory: {
        total: number;
        free: number;
        used: number;
    };
    uptime: number;
    platform: string;
}

export const SystemHealthWidget: React.FC = () => {
    const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const data = await api.admin.getSystemHealth();
                setHealthData(data as any);
                setLoading(false);
            } catch (e) {
                console.error("Failed to fetch system health");
            }
        };

        fetchHealth();
        const interval = setInterval(fetchHealth, 2000); // Poll every 2s for realtime feel

        return () => clearInterval(interval);
    }, []);

    // Helper to format memory
    const formatBytes = (bytes: number) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Byte';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    // Helper to format uptime
    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600*24));
        const h = Math.floor(seconds % (3600*24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        return `${d}d ${h}h ${m}m`;
    };

    return (
        <div className="bg-slate-900 rounded-xl shadow-lg text-white relative overflow-hidden p-6 transition-all hover:shadow-xl group h-full">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Server className="w-32 h-32" />
            </div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 shadow-inner">
                        <Activity className={`w-5 h-5 ${healthData ? 'text-emerald-400' : 'text-slate-500'}`} />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-slate-200">Real-time Node Status</h3>
                        <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            {healthData ? healthData.platform : 'Connecting to socket...'}
                        </p>
                    </div>
                    <div className="ml-auto">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${healthData ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="py-8 flex justify-center text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : healthData ? (
                    <div className="space-y-4 animate-in fade-in">
                        {/* CPU Bar */}
                        <div>
                            <div className="flex justify-between items-center text-xs mb-1">
                                <span className="text-slate-400 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> CPU Load</span>
                                <span className={`font-mono font-bold ${healthData.cpu > 80 ? 'text-red-400' : healthData.cpu > 50 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                    {healthData.cpu}%
                                </span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all duration-1000 ease-out ${
                                        healthData.cpu > 80 ? 'bg-red-500' : healthData.cpu > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(healthData.cpu, 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Memory Bar */}
                        <div>
                            <div className="flex justify-between items-center text-xs mb-1 pt-1">
                                <span className="text-slate-400 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Memory</span>
                                <span className="font-mono text-indigo-400">
                                    {formatBytes(healthData.memory.used)} / {formatBytes(healthData.memory.total)}
                                </span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className="bg-indigo-500 h-full rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out"
                                    style={{ width: `${(healthData.memory.used / healthData.memory.total) * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                            <span>Uptime: {formatUptime(healthData.uptime)}</span>
                            <span className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">System Online</span>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-xs text-red-400">Connection Failed</div>
                )}
            </div>
        </div>
    );
};