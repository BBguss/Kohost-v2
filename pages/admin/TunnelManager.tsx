
import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { TunnelRoute } from '../../types';
import { Cloud, Plus, RefreshCw, Trash2, Edit2, X, Loader2, Globe, Server, Search, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, Link, FileCode, Unlink, Save, CheckCircle, AlertOctagon, BarChart3, Activity, Network, Filter, ChevronDown, ServerCrash } from 'lucide-react';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, YAxis } from 'recharts';

const ITEMS_PER_PAGE = 15;

export const TunnelManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ROUTES' | 'ZONES' | 'ANALYTICS'>('ROUTES');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  
  // Data States
  const [routes, setRoutes] = useState<TunnelRoute[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  
  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [filterZone, setFilterZone] = useState(''); // Filter by Domain/Zone
  const [currentPage, setCurrentPage] = useState(1);

  // Modal States
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [routeModalMode, setRouteModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [routeForm, setRouteForm] = useState({ hostname: '', service: 'http://localhost:' });
  const [currentHostname, setCurrentHostname] = useState('');

  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [newZoneDomain, setNewZoneDomain] = useState('');
  const [zoneDetails, setZoneDetails] = useState<any | null>(null); // For viewing nameservers

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Delete Modal State
  const [deleteConfig, setDeleteConfig] = useState<{ type: 'ROUTE' | 'ZONE'; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Feedback
  const [feedback, setFeedback] = useState<{
      isOpen: boolean; type: 'success' | 'error'; title: string; message: string;
  }>({ isOpen: false, type: 'success', title: '', message: '' });

  useEffect(() => {
    loadData();
    setCurrentPage(1); // Reset page on tab change
    setSearchQuery('');
    setFilterZone('');
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setInitError(null);
    try {
        if (activeTab === 'ROUTES') {
            // Fetch both routes and zones to populate the filter dropdown
            const [routesData, zonesData] = await Promise.all([
                api.admin.tunnels.list(),
                api.admin.cfDomains.list()
            ]);
            setRoutes(routesData);
            setZones(zonesData);
        } else if (activeTab === 'ZONES') {
            const data = await api.admin.cfDomains.list();
            setZones(data);
        } else if (activeTab === 'ANALYTICS') {
            // Fetch larger dataset for client-side filtering, and fetch zones for the dropdown
            const [analyticsData, zonesData] = await Promise.all([
                api.admin.getTunnelAnalytics(100),
                api.admin.cfDomains.list()
            ]);
            setAnalytics(analyticsData.data);
            setZones(zonesData);
        }
    } catch (e: any) {
        console.error("Failed to load data", e);
        setInitError(e.message || "Failed to connect to Cloudflare service");
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  };

  const handleRefresh = () => {
      setRefreshing(true);
      loadData();
  };

  // --- ROUTE ACTIONS ---
  const handleRouteSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
          if (routeModalMode === 'CREATE') {
              await api.admin.tunnels.create(routeForm.hostname, routeForm.service);
              setFeedback({ isOpen: true, type: 'success', title: 'Route Created', message: `Hostname ${routeForm.hostname} is now active.` });
          } else {
              await api.admin.tunnels.edit(currentHostname, routeForm.hostname, routeForm.service);
              setFeedback({ isOpen: true, type: 'success', title: 'Route Updated', message: `Configuration updated for ${routeForm.hostname}.` });
          }
          setIsRouteModalOpen(false);
          loadData();
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Operation Failed', message: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  const requestDeleteRoute = (hostname: string) => {
      setDeleteConfig({ type: 'ROUTE', id: hostname, name: hostname });
  };

  const requestDeleteZone = (id: string, name: string) => {
      setDeleteConfig({ type: 'ZONE', id: id, name: name });
  };

  const confirmDelete = async () => {
      if (!deleteConfig) return;
      setIsDeleting(true);
      try {
          if (deleteConfig.type === 'ROUTE') {
              await api.admin.tunnels.delete(deleteConfig.id);
              setRoutes(routes.filter(r => r.hostname !== deleteConfig.id));
              setFeedback({ isOpen: true, type: 'success', title: 'Deleted', message: 'Route removed successfully.' });
          } else {
              await api.admin.cfDomains.delete(deleteConfig.id);
              setZones(zones.filter(z => z.id !== deleteConfig.id));
              setFeedback({ isOpen: true, type: 'success', title: 'Deleted', message: 'Zone removed successfully.' });
          }
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Delete Failed', message: e.message });
      } finally {
          setIsDeleting(false);
          setDeleteConfig(null);
      }
  };

  // --- ZONE ACTIONS ---
  const handleCreateZone = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newZoneDomain) return;
      setIsSubmitting(true);
      try {
          const res = await api.admin.cfDomains.create(newZoneDomain);
          setIsZoneModalOpen(false);
          setNewZoneDomain('');
          loadData();
          
          if (res.nameservers) {
              setFeedback({ 
                  isOpen: true, type: 'success', title: 'Zone Created', 
                  message: `Please set nameservers to: ${res.nameservers.join(', ')}` 
              });
          }
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Failed to Add Site', message: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  const viewZoneDetails = async (id: string) => {
      const details = await api.admin.cfDomains.getDetails(id);
      if (details) {
          setZoneDetails(details);
      }
  };

  // --- FILTER & PAGINATION HELPERS ---
  const getFilteredData = () => {
      if (activeTab === 'ROUTES') {
          return routes.filter(r => {
              const matchesSearch = r.hostname.toLowerCase().includes(searchQuery.toLowerCase()) || r.service.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesZone = filterZone ? r.hostname.endsWith(filterZone) : true;
              return matchesSearch && matchesZone;
          });
      } else if (activeTab === 'ZONES') {
          return zones.filter(z => z.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
      return [];
  };

  // Filter Logic specifically for Analytics Chart
  const getFilteredAnalytics = () => {
      if (activeTab !== 'ANALYTICS') return [];
      
      return analytics.filter(item => {
          const matchesSearch = searchQuery ? item.host.toLowerCase().includes(searchQuery.toLowerCase()) : true;
          const matchesZone = filterZone ? item.host.endsWith(filterZone) : true;
          return matchesSearch && matchesZone;
      });
  };

  const filteredItems = getFilteredData();
  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const chartData = getFilteredAnalytics();

  // --- RENDER ERROR STATE ---
  if (initError) {
      return (
          <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          <Cloud className="w-6 h-6 text-orange-500" /> Cloudflare Manager
                      </h2>
                  </div>
              </div>
              
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                  <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
                      <ServerCrash className="w-10 h-10 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Connection Failed</h3>
                  <p className="text-slate-500 max-w-md mb-6">{initError}</p>
                  <button 
                      onClick={loadData}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2"
                  >
                      <RefreshCw className="w-4 h-4" /> Retry Connection
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
        {/* Feedback Modal */}
        {feedback.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setFeedback({...feedback, isOpen: false})} />
                <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in zoom-in-95">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            {feedback.type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertOctagon className="w-6 h-6" />}
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">{feedback.title}</h3>
                            <p className="text-sm text-slate-500 mt-1">{feedback.message}</p>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={() => setFeedback({...feedback, isOpen: false})} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold">Close</button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Cloud className="w-6 h-6 text-orange-500" /> Cloudflare Manager
                </h2>
                <p className="text-sm text-slate-500 mt-1">Manage Ingress Routes, Zones, and Traffic.</p>
            </div>
            <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <button 
                    onClick={() => setActiveTab('ROUTES')} 
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'ROUTES' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Network className="w-4 h-4" /> Routes
                </button>
                <button 
                    onClick={() => setActiveTab('ZONES')} 
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'ZONES' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Globe className="w-4 h-4" /> Zones
                </button>
                <button 
                    onClick={() => setActiveTab('ANALYTICS')} 
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${activeTab === 'ANALYTICS' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Activity className="w-4 h-4" /> Analytics
                </button>
            </div>
        </div>

        {/* Controls Toolbar - Now Visible for Analytics too */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder={activeTab === 'ROUTES' ? "Search hostname..." : activeTab === 'ZONES' ? "Search domain..." : "Search stats..."} 
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                </div>
                {/* Zone Filter Dropdown - For Routes and Analytics */}
                {(activeTab === 'ROUTES' || activeTab === 'ANALYTICS') && (
                    <div className="relative hidden md:block">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select 
                            value={filterZone}
                            onChange={(e) => { setFilterZone(e.target.value); setCurrentPage(1); }}
                            className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white appearance-none cursor-pointer hover:bg-slate-50"
                        >
                            <option value="">All Zones</option>
                            {zones.map(z => (
                                <option key={z.id} value={z.name}>{z.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                )}
            </div>
            
            <div className="flex gap-2 w-full md:w-auto justify-end">
                <button onClick={handleRefresh} className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200"><RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} /></button>
                {activeTab === 'ROUTES' && (
                    <button onClick={() => { setRouteModalMode('CREATE'); setRouteForm({hostname:'', service:'http://localhost:'}); setIsRouteModalOpen(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-sm whitespace-nowrap"><Plus className="w-4 h-4" /> Add Route</button>
                )} 
                {activeTab === 'ZONES' && (
                    <button onClick={() => setIsZoneModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-sm whitespace-nowrap"><Plus className="w-4 h-4" /> Add Site</button>
                )}
            </div>
        </div>

        <Card className="min-h-[500px] flex flex-col">
            {loading && !refreshing ? (
                <div className="flex-1 flex justify-center items-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
            ) : activeTab === 'ROUTES' ? (
                <>
                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Public Hostname</th>
                                    <th className="px-6 py-3 font-medium">Internal Service</th>
                                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedItems.map((route: any) => (
                                    <tr key={route.hostname} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-slate-400" />
                                            {route.hostname}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-slate-600">
                                            {route.service}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => { setRouteModalMode('EDIT'); setCurrentHostname(route.hostname); setRouteForm(route); setIsRouteModalOpen(true); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => requestDeleteRoute(route.hostname)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {paginatedItems.length === 0 && <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">No routes found matching your criteria.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : activeTab === 'ZONES' ? (
                <div className="overflow-x-auto flex-1">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-medium">Domain Name</th>
                                <th className="px-6 py-3 font-medium">Status</th>
                                <th className="px-6 py-3 font-medium">Plan</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedItems.map((zone: any) => (
                                <tr key={zone.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-800">{zone.name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${zone.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {zone.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{zone.plan || 'Free'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => viewZoneDetails(zone.id)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100">Details</button>
                                            <button onClick={() => requestDeleteZone(zone.id, zone.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedItems.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500 italic">No zones found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Traffic Analytics (24h)</h3>
                        <div className="text-xs text-slate-500">
                            Showing {chartData.length} records {filterZone && `in ${filterZone}`}
                        </div>
                    </div>
                    <div className="h-[400px]">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="host" tick={{fontSize: 11}} height={60} interval={0} angle={-30} textAnchor="end" />
                                    <YAxis />
                                    <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="visits" fill="#f97316" radius={[4, 4, 0, 0]} barSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Activity className="w-12 h-12 mb-3 opacity-20" />
                                <p>No traffic data matches your filter.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Pagination Controls (Only for Routes and Zones lists) */}
            {activeTab !== 'ANALYTICS' && totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} results
                    </span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-medium text-slate-700">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </Card>

        {/* Delete Confirmation Modal */}
        {deleteConfig && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setDeleteConfig(null)} />
                <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in zoom-in-95">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-red-100 rounded-full shrink-0">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Confirm Deletion</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Are you sure you want to delete <span className="font-bold text-slate-800">{deleteConfig.name}</span>?
                                {deleteConfig.type === 'ROUTE' 
                                    ? ' This route will stop working immediately.' 
                                    : ' This domain will be removed from Cloudflare.'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button 
                            onClick={() => setDeleteConfig(null)} 
                            disabled={isDeleting}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDelete} 
                            disabled={isDeleting}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2"
                        >
                            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Route Modal */}
        {isRouteModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsRouteModalOpen(false)} />
                <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">{routeModalMode === 'CREATE' ? 'Add New Route' : 'Edit Route'}</h3>
                    <form onSubmit={handleRouteSubmit} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Hostname (Public)</label>
                            <input type="text" value={routeForm.hostname} onChange={e => setRouteForm({...routeForm, hostname: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" required placeholder="app.example.com" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Service (Local)</label>
                            <input type="text" value={routeForm.service} onChange={e => setRouteForm({...routeForm, service: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono" required />
                            <p className="text-[10px] text-slate-500 mt-1">Example: http://localhost:3000</p>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setIsRouteModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Zone Detail Modal */}
        {zoneDetails && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setZoneDetails(null)} />
                <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">{zoneDetails.domain}</h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${zoneDetails.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{zoneDetails.status.toUpperCase()}</span>
                        </div>
                        <button onClick={() => setZoneDetails(null)}><X className="w-5 h-5 text-slate-400" /></button>
                    </div>
                    
                    <div className="space-y-4">
                        {zoneDetails.nameservers && (
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Server className="w-4 h-4" /> Nameservers</h4>
                                <ul className="space-y-1">
                                    {zoneDetails.nameservers.map((ns: string) => (
                                        <li key={ns} className="font-mono text-sm text-indigo-600 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">{ns}</li>
                                    ))}
                                </ul>
                                <p className="text-xs text-slate-500 mt-2">Update these at your domain registrar to activate.</p>
                            </div>
                        )}
                        {zoneDetails.activated_on && (
                            <p className="text-sm text-slate-600">Activated: {new Date(zoneDetails.activated_on).toLocaleDateString()}</p>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Add Zone Modal */}
        {isZoneModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsZoneModalOpen(false)} />
                <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Add New Site (Zone)</h3>
                    <form onSubmit={handleCreateZone} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Domain Name</label>
                            <input type="text" value={newZoneDomain} onChange={e => setNewZoneDomain(e.target.value)} placeholder="example.com" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" required />
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setIsZoneModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Site'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};
