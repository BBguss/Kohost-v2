import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { TunnelRoute } from '../../types';
import { Network, Plus, RefreshCw, Trash2, Edit2, X, Loader2, Globe, Server, Search, AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, Link, FileCode, Unlink, Save, CheckCircle, AlertOctagon, ChevronLeft, ChevronRight } from 'lucide-react';

const ITEMS_PER_PAGE = 25;

export const TunnelManager: React.FC = () => {
  const [tunnels, setTunnels] = useState<TunnelRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Apache Matching State
  const [apacheConfigs, setApacheConfigs] = useState<Record<string, string>>({}); // Map<Port, Filename>
  
  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: keyof TunnelRoute; direction: 'asc' | 'desc' } | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [currentHostname, setCurrentHostname] = useState(''); // Only used for finding item in edit mode
  const [formData, setFormData] = useState({ hostname: '', service: 'http://127.0.0.1:' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete State
  const [tunnelToDelete, setTunnelToDelete] = useState<TunnelRoute | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Apache Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingConfigName, setEditingConfigName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Feedback State
  const [feedback, setFeedback] = useState<{
      isOpen: boolean;
      type: 'success' | 'error';
      title: string;
      message: string;
  }>({ isOpen: false, type: 'success', title: '', message: '' });

  const closeFeedback = () => setFeedback(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    loadData();
  }, []);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tunnelsData, sitesList] = await Promise.all([
          api.admin.tunnels.list(),
          api.admin.apache.listSites()
      ]);
      setTunnels(tunnelsData);

      // Parse Apache Configs to find ports
      const portMap: Record<string, string> = {};
      await Promise.all(sitesList.map(async (filename) => {
          try {
              const siteData = await api.admin.apache.getSite(filename);
              // Extract port from <VirtualHost *:PORT> or <VirtualHost PORT>
              const match = siteData.content.match(/<VirtualHost [^>]*:(\d+)>/);
              if (match && match[1]) {
                  portMap[match[1]] = filename;
              }
          } catch (e) {
              console.error(`Failed to parse ${filename}`);
          }
      }));
      setApacheConfigs(portMap);

    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Helper to extract port from tunnel service URL
  const getTunnelPort = (serviceUrl: string) => {
      const match = serviceUrl.match(/:(\d+)$/);
      return match ? match[1] : null;
  };

  const handleSort = (key: keyof TunnelRoute) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const openCreateModal = () => {
    setModalMode('CREATE');
    setFormData({ hostname: '', service: 'http://127.0.0.1:' });
    setIsModalOpen(true);
  };

  const openEditModal = (tunnel: TunnelRoute) => {
    setModalMode('EDIT');
    setCurrentHostname(tunnel.hostname);
    setFormData({ hostname: tunnel.hostname, service: tunnel.service });
    setIsModalOpen(true);
  };

  const initiateDelete = (tunnel: TunnelRoute) => {
    setTunnelToDelete(tunnel);
  };

  const confirmDelete = async () => {
    if (!tunnelToDelete) return;
    setIsDeleting(true);
    try {
      // 1. Delete Tunnel Route
      await api.admin.tunnels.delete(tunnelToDelete.hostname);
      
      let extraMessage = "";
      
      // 2. Check and Delete Apache Config if exists
      const port = getTunnelPort(tunnelToDelete.service);
      const associatedConfig = port ? apacheConfigs[port] : null;

      if (associatedConfig) {
          try {
              await api.admin.apache.deleteSite(associatedConfig);
              extraMessage = ` and Apache config "${associatedConfig}"`;
          } catch (configErr) {
              console.error("Failed to cleanup apache config", configErr);
              extraMessage = ` but failed to delete config "${associatedConfig}"`;
          }
      }

      // Refresh logic is inside loadData called below, but we can optimistically update local state too
      setTunnels(tunnels.filter(t => t.hostname !== tunnelToDelete.hostname));
      setTunnelToDelete(null);
      
      loadData(); // Reload to refresh apache list

      setFeedback({
          isOpen: true,
          type: 'success',
          title: 'Cleanup Successful',
          message: `The tunnel route${extraMessage} has been removed.`
      });
    } catch (e: any) {
      setFeedback({
          isOpen: true,
          type: 'error',
          title: 'Delete Failed',
          message: e.message || 'An error occurred while deleting the route.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let message = "";
      if (modalMode === 'CREATE') {
        await api.admin.tunnels.create(formData.hostname, formData.service);
        message = "New tunnel route created successfully on Cloudflare.";
      } else {
        await api.admin.tunnels.edit(currentHostname, formData.hostname, formData.service);
        message = "Tunnel route configuration updated successfully.";
      }
      setIsModalOpen(false);
      loadData(); // Refresh list to update matches from real API
      
      // Show Success Confirmation
      setFeedback({
          isOpen: true,
          type: 'success',
          title: 'Success!',
          message: message
      });

    } catch (e: any) {
      // Use setFeedback to show API error
      setFeedback({
          isOpen: true,
          type: 'error',
          title: `Failed to ${modalMode === 'CREATE' ? 'create' : 'update'} route`,
          message: e.message || "An unexpected error occurred."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- APACHE EDITOR HANDLERS ---
  const handleOpenConfigEditor = async (filename: string) => {
      setEditingConfigName(filename);
      setEditorOpen(true);
      setLoadingConfig(true);
      try {
          const data = await api.admin.apache.getSite(filename);
          setEditorContent(data.content);
      } catch (e) {
          setEditorContent("# Error loading file content.");
      } finally {
          setLoadingConfig(false);
      }
  };

  const handleSaveConfig = async () => {
      setSavingConfig(true);
      try {
          await api.admin.apache.updateSite(editingConfigName, editorContent);
          setEditorOpen(false);
          loadData(); // Reload to ensure regex parsers catch any port changes
          
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Config Saved',
              message: `Configuration for ${editingConfigName} updated successfully.`
          });
      } catch (e) {
          alert("Failed to save configuration.");
      } finally {
          setSavingConfig(false);
      }
  };

  // Filter & Sort logic
  const filteredTunnels = tunnels.filter(tunnel => 
      tunnel.hostname.toLowerCase().includes(searchQuery.toLowerCase()) || 
      tunnel.service.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedTunnels = [...filteredTunnels].sort((a, b) => {
      if (!sortConfig) return 0;
      
      const valA = a[sortConfig.key].toLowerCase();
      const valB = b[sortConfig.key].toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
  });

  // Pagination Logic
  const totalItems = sortedTunnels.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedTunnels = sortedTunnels.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

  // Calculate delete modal info
  const deletePort = tunnelToDelete ? getTunnelPort(tunnelToDelete.service) : null;
  const deleteConfigName = deletePort ? apacheConfigs[deletePort] : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
      
      {/* FEEDBACK POPUP MODAL */}
      {feedback.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={closeFeedback} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className={`h-2 w-full ${feedback.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full shrink-0 ${feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            {feedback.type === 'success' ? <CheckCircle className="w-8 h-8" /> : <AlertOctagon className="w-8 h-8" />}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">{feedback.title}</h3>
                            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{feedback.message}</p>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <button 
                            onClick={closeFeedback} 
                            className={`px-5 py-2 rounded-lg font-bold text-sm text-white shadow-md transition-all hover:scale-105 active:scale-95 ${
                                feedback.type === 'success' 
                                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                                : 'bg-slate-900 hover:bg-slate-800'
                            }`}
                        >
                            {feedback.type === 'success' ? 'OK, Great!' : 'Close'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
             <Network className="w-6 h-6 text-indigo-600" /> Cloudflare Tunnels
           </h2>
           <p className="text-sm text-slate-500 mt-1">Manage ingress rules and external routing.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search hostname or service..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
            </div>

            <div className="flex gap-2">
                <button 
                    onClick={handleRefresh} 
                    className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm"
                    title="Refresh List"
                >
                    <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button 
                    onClick={openCreateModal} 
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" /> Add Route
                </button>
            </div>
        </div>
      </div>

      <Card>
         {loading && !refreshing ? (
             <div className="py-12 flex justify-center">
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
             </div>
         ) : (
            <>
            <div className="overflow-x-auto min-h-[400px]">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-3 font-medium w-16 text-center">#</th>
                        <th 
                            className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                            onClick={() => handleSort('hostname')}
                        >
                            <div className="flex items-center gap-2">
                                Hostname (Public)
                                {sortConfig?.key === 'hostname' ? (
                                    sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />
                                ) : (
                                    <ArrowUpDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                                )}
                            </div>
                        </th>
                        <th 
                            className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                            onClick={() => handleSort('service')}
                        >
                            <div className="flex items-center gap-2">
                                Internal Service
                                {sortConfig?.key === 'service' ? (
                                    sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />
                                ) : (
                                    <ArrowUpDown className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                                )}
                            </div>
                        </th>
                        <th className="px-6 py-3 font-medium">Apache Config</th>
                        <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {paginatedTunnels.map((tunnel, idx) => {
                        const port = getTunnelPort(tunnel.service);
                        const matchedConfig = port ? apacheConfigs[port] : null;
                        const realIndex = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;

                        return (
                        <tr key={tunnel.hostname} className="hover:bg-slate-50/50 group">
                            <td className="px-6 py-4 text-slate-500 font-mono text-xs text-center">
                                {realIndex}
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800">
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-slate-400" />
                                    {tunnel.hostname}
                                </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-600">
                                <div className="flex items-center gap-2">
                                    <Server className="w-4 h-4 text-slate-400" />
                                    {tunnel.service}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                {matchedConfig ? (
                                    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-xs font-medium">
                                        <Link className="w-3.5 h-3.5" />
                                        <div className="flex flex-col leading-none">
                                            <button 
                                                onClick={() => handleOpenConfigEditor(matchedConfig)}
                                                className="font-bold hover:underline hover:text-emerald-900 text-left transition-colors"
                                                title="Edit Config"
                                            >
                                                {matchedConfig}
                                            </button>
                                            <span className="text-[10px] opacity-80 mt-0.5 font-mono">Port {port}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-xs font-medium">
                                        <Unlink className="w-3.5 h-3.5" />
                                        <span>No Config</span>
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditModal(tunnel)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => initiateDelete(tunnel)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    )})}
                    {paginatedTunnels.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                {tunnels.length === 0 ? "No active tunnel routes found." : "No routes match your search."}
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                    <span className="text-sm text-slate-500">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} routes
                    </span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium text-slate-700">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 border border-slate-300 rounded-lg bg-white text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
            </>
         )}
      </Card>

      {/* Create/Edit Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)} />
              <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-slate-900">{modalMode === 'CREATE' ? 'Create New Route' : 'Edit Route'}</h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Hostname</label>
                          <input 
                              type="text" 
                              required
                              value={formData.hostname} 
                              onChange={(e) => setFormData({...formData, hostname: e.target.value})}
                              placeholder="api.domain.kolab.top"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Internal Service</label>
                          <input 
                              type="text" 
                              required
                              value={formData.service} 
                              onChange={(e) => setFormData({...formData, service: e.target.value})}
                              placeholder="http://127.0.0.1:9000"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                          />
                          <p className="text-xs text-slate-500">Usually points to a localhost port (e.g., http://127.0.0.1:3000)</p>
                      </div>

                      <div className="pt-4 flex justify-end gap-3">
                          <button 
                             type="button" 
                             onClick={() => setIsModalOpen(false)} 
                             className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              type="submit" 
                              disabled={isSubmitting}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                              {modalMode === 'CREATE' ? 'Create Route' : 'Save Changes'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* APACHE EDITOR MODAL */}
      {editorOpen && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setEditorOpen(false)} />
              <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[85vh]">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                      <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              <FileCode className="w-5 h-5 text-indigo-600" />
                              Edit Config
                          </h3>
                          <p className="text-xs text-slate-500 font-mono mt-1">{editingConfigName}</p>
                      </div>
                      <button onClick={() => setEditorOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>

                  <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden relative">
                      {loadingConfig ? (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                              <Loader2 className="w-8 h-8 animate-spin" />
                          </div>
                      ) : (
                          <textarea 
                              value={editorContent}
                              onChange={(e) => setEditorContent(e.target.value)}
                              className="w-full h-full bg-slate-900 text-emerald-400 font-mono text-sm p-4 focus:outline-none resize-none"
                              spellCheck={false}
                          />
                      )}
                  </div>

                  <div className="pt-4 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setEditorOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Close</button>
                      <button 
                          onClick={handleSaveConfig} 
                          disabled={savingConfig || loadingConfig}
                          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                          {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Config
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {tunnelToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setTunnelToDelete(null)} />
              <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-100 rounded-full shrink-0">
                          <AlertTriangle className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-900">Delete Route?</h3>
                          <p className="text-sm text-slate-500 mt-1">
                              Are you sure you want to delete the route for <span className="font-bold text-slate-800">{tunnelToDelete.hostname}</span>?
                          </p>
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-100">
                              External traffic to this hostname will no longer be forwarded.
                          </p>
                          
                          {deleteConfigName && (
                              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                                  <Trash2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span>
                                      <strong>Auto-Cleanup:</strong> The linked Apache config file <code className="font-bold">{deleteConfigName}</code> will also be deleted.
                                  </span>
                              </div>
                          )}
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button 
                          onClick={() => setTunnelToDelete(null)} 
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
    </div>
  );
};