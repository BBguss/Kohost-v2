import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { Users, DollarSign, Network, CheckCircle, Server, TrendingUp, CreditCard, Globe, ArrowUpRight, ArrowDownRight, Clock, FileCode, X, RefreshCw, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { SystemHealthWidget } from '../../components/admin/SystemHealthWidget';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({ 
      totalUsers: 0, 
      totalSites: 0, 
      activeRevenue: '0',
      totalTunnels: 0,
      totalApacheSites: 0
  });
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [revenueChartData, setRevenueChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Full Analytics Modal State
  const [showAllAnalytics, setShowAllAnalytics] = useState(false);
  const [fullAnalytics, setFullAnalytics] = useState<any[]>([]);
  const [loadingFullAnalytics, setLoadingFullAnalytics] = useState(false);

  useEffect(() => {
     const loadStats = async () => {
         try {
             const [statsData, analyticsData, revenueData] = await Promise.all([
                 api.admin.getStats(),
                 api.admin.getTunnelAnalytics(5), // Fetch top 5 for chart
                 api.admin.getRevenueAnalytics()
             ]);
             setStats(statsData);
             setAnalytics(analyticsData.data || []);
             setRevenueChartData(revenueData);
         } catch (e) {
             console.error("Failed to load stats", e);
         } finally {
             setLoading(false);
         }
     };
     loadStats();
  }, []);

  const loadFullAnalytics = async () => {
      setLoadingFullAnalytics(true);
      try {
          const data = await api.admin.getTunnelAnalytics(100); // Fetch top 100
          setFullAnalytics(data.data || []);
      } catch (e) {
          console.error("Failed to load full analytics", e);
      } finally {
          setLoadingFullAnalytics(false);
      }
  };

  const handleViewAllAnalytics = () => {
      setShowAllAnalytics(true);
      loadFullAnalytics();
  };

  const StatWidget = ({ 
    title, 
    value, 
    icon: Icon, 
    gradient, 
    trend, 
    trendUp, 
    subLabel 
  }: { 
    title: string, 
    value: string | number, 
    icon: any, 
    gradient: string, 
    trend?: string, 
    trendUp?: boolean,
    subLabel?: string
  }) => (
    <div className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-transform hover:scale-[1.02] duration-300 ${gradient}`}>
        {/* Background Decoration */}
        <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
            <Icon className="w-32 h-32" />
        </div>
        
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl border border-white/10 shadow-inner">
                    <Icon className="w-6 h-6 text-white" />
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold backdrop-blur-md border border-white/10 ${trendUp ? 'bg-emerald-400/30 text-emerald-50' : 'bg-red-400/30 text-red-50'}`}>
                        {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {trend}
                    </div>
                )}
            </div>
            
            <div className="space-y-1">
                <h3 className="text-indigo-100 text-sm font-medium tracking-wide opacity-90">{title}</h3>
                <div className="text-3xl font-bold tracking-tight">{value}</div>
                {subLabel && <p className="text-xs text-white/60 font-medium">{subLabel}</p>}
            </div>
        </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10 relative">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
              <p className="text-slate-500 text-sm mt-1">Welcome back, Administrator. Here's what's happening today.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <Clock className="w-4 h-4" />
              <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatWidget 
            title="Total Revenue" 
            value={`Rp ${stats.activeRevenue}`} 
            icon={DollarSign} 
            gradient="bg-gradient-to-br from-indigo-600 to-violet-600"
            trend="+12.5%"
            trendUp={true}
            subLabel="Verified Payments"
        />
        <StatWidget 
            title="Active Users" 
            value={stats.totalUsers} 
            icon={Users} 
            gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
            trend="+3 New"
            trendUp={true}
            subLabel="Total Registered"
        />
        <StatWidget 
            title="Deployed Sites" 
            value={stats.totalSites} 
            icon={Globe} 
            gradient="bg-gradient-to-br from-emerald-500 to-teal-500"
            trend="+5%"
            trendUp={true}
            subLabel="Across all nodes"
        />
        <StatWidget 
            title="Active Tunnels" 
            value={stats.totalTunnels} 
            icon={Network} 
            gradient="bg-gradient-to-br from-orange-500 to-amber-500"
            trend="Stable"
            trendUp={true} 
            subLabel="Cloudflare Routes"
        />
      </div>

      {/* Charts & Health Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Revenue Chart */}
        <div className="lg:col-span-2">
            <Card className="h-full border-0 shadow-md ring-1 ring-slate-200/60">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" /> Revenue Analytics
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Income trends over the last 7 days</p>
                    </div>
                    <select className="text-xs border-none bg-slate-50 rounded-lg px-2 py-1 text-slate-600 outline-none cursor-pointer hover:bg-slate-100 transition-colors">
                        <option>Last 7 Days</option>
                    </select>
                </div>
                <div className="p-6 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={revenueChartData}>
                            <defs>
                                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} dy={10} />
                            <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val} />
                            <Tooltip 
                                contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                                itemStyle={{color: '#4338ca', fontWeight: 'bold'}}
                                formatter={(value: number) => `Rp ${value.toLocaleString()}`}
                            />
                            <Area type="monotone" dataKey="income" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        </div>

        {/* Real-time System Health */}
        <div className="lg:col-span-1">
             <SystemHealthWidget />
        </div>
      </div>

      {/* Traffic Analytics (Full Width) */}
      <div className="grid grid-cols-1">
         <Card className="h-full border-0 shadow-md ring-1 ring-slate-200/60">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Server className="w-5 h-5 text-emerald-600" /> Top Active Hosts
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Most visited tunnels (24h)</p>
                    </div>
                    <button 
                        onClick={handleViewAllAnalytics}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                    >
                        View All
                    </button>
                </div>
                <div className="p-6 h-[250px]">
                    {analytics.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={analytics} margin={{ left: 0, right: 0, bottom: 0, top: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="host" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{fill: '#f1f5f9'}} 
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                                />
                                <Bar dataKey="visits" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <Network className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-sm">No traffic data available</p>
                        </div>
                    )}
                </div>
         </Card>
      </div>

      {/* Full Analytics Modal */}
      {showAllAnalytics && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAllAnalytics(false)} />
              <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl shrink-0">
                      <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              <Server className="w-5 h-5 text-emerald-600" /> Top Active Hosts (24h)
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Full report fetched from Cloudflare Analytics</p>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={loadFullAnalytics} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors" title="Refresh">
                              <RefreshCw className={`w-4 h-4 ${loadingFullAnalytics ? 'animate-spin' : ''}`} />
                          </button>
                          <button onClick={() => setShowAllAnalytics(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                              <X className="w-5 h-5" />
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-0">
                      <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                              <tr>
                                  <th className="px-6 py-3 font-medium w-20 text-center">Rank</th>
                                  <th className="px-6 py-3 font-medium">Hostname</th>
                                  <th className="px-6 py-3 font-medium text-right">Total Visits</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {loadingFullAnalytics ? (
                                  <tr>
                                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
                                          Loading analytics data...
                                      </td>
                                  </tr>
                              ) : fullAnalytics.length > 0 ? (
                                  fullAnalytics.map((item, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                          <td className="px-6 py-3 text-center">
                                              <span className={`inline-block w-6 h-6 rounded-full text-xs leading-6 font-bold ${idx < 3 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                  {item.rank || idx + 1}
                                              </span>
                                          </td>
                                          <td className="px-6 py-3 font-medium text-slate-800">
                                              {item.host}
                                          </td>
                                          <td className="px-6 py-3 text-right font-mono font-bold text-emerald-600">
                                              {item.visits.toLocaleString()}
                                          </td>
                                      </tr>
                                  ))
                              ) : (
                                  <tr>
                                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">
                                          No data available for the selected period.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
                  <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between rounded-b-xl shrink-0">
                      <span>Showing top {fullAnalytics.length} hosts</span>
                      <span>Source: Cloudflare GraphQL API</span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};