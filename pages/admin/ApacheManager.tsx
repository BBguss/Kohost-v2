
import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { FileCode, Settings, RefreshCw, Plus, Trash2, Edit2, Save, X, Loader2, AlertTriangle, CheckCircle, AlertOctagon, Search, ChevronLeft, ChevronRight, FileText, Globe } from 'lucide-react';

const ITEMS_PER_PAGE = 25;

interface HostEntry {
    ip: string;
    domain: string;
}

export const ApacheManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SITES' | 'HTTPD' | 'HOSTS'>('SITES');
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [sites, setSites] = useState<string[]>([]);
  const [httpdContent, setHttpdContent] = useState('');
  const [hostsEntries, setHostsEntries] = useState<HostEntry[]>([]);
  
  // Pagination & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Editor State (Site & Httpd)
  const [editorMode, setEditorMode] = useState<'EDIT_SITE' | 'CREATE_SITE' | null>(null);
  const [currentFileName, setCurrentFileName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Create Site Form State (For Template)
  const [createForm, setCreateForm] = useState({ domain: '', folder: '' });

  // Add Host Form State
  const [hostForm, setHostForm] = useState({ ip: '127.0.0.1', domain: '' });

  // Delete State
  const [deleteConfig, setDeleteConfig] = useState<{ type: 'SITE' | 'HOST', id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback/Notification State
  const [feedback, setFeedback] = useState<{
      isOpen: boolean;
      type: 'success' | 'error';
      title: string;
      message: string;
  }>({ isOpen: false, type: 'success', title: '', message: '' });

  const closeFeedback = () => setFeedback(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    loadData();
    setCurrentPage(1);
    setSearchQuery('');
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
        if (activeTab === 'SITES') {
            const data = await api.admin.apache.listSites();
            setSites(data);
        } else if (activeTab === 'HTTPD') {
            const data = await api.admin.apache.getHttpd();
            setHttpdContent(data.content);
        } else if (activeTab === 'HOSTS') {
            const data = await api.admin.apache.getHosts();
            // Parse raw hosts file content into entries
            const lines = data.content.split('\n');
            const entries: HostEntry[] = [];
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                // Basic validation for IP starting lines
                if (parts.length >= 2 && !line.trim().startsWith('#')) {
                    entries.push({ ip: parts[0], domain: parts[1] });
                }
            });
            setHostsEntries(entries);
        }
    } catch (e) {
        console.error("Failed to load apache data", e);
    } finally {
        setLoading(false);
    }
  };

  // --- TEMPLATE GENERATOR ---
  const generateTemplate = (domain: string, folder: string) => {
      return `<VirtualHost *:80>
    ServerName ${domain}
    DocumentRoot "Z:/www/${folder}"

    <Directory "Z:/www/${folder}">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html
    </Directory>
</VirtualHost>`;
  };

  const openCreateModal = () => {
      setEditorMode('CREATE_SITE');
      setCreateForm({ domain: '', folder: '' });
      setEditorContent(''); 
  };

  const openEditSite = async (filename: string) => {
      try {
          setLoading(true);
          const data = await api.admin.apache.getSite(filename);
          setCurrentFileName(filename);
          setEditorContent(data.content);
          setEditorMode('EDIT_SITE');
      } catch (e) {
          setFeedback({ isOpen: true, type: 'error', title: 'Error', message: 'Failed to load site config' });
      } finally {
          setLoading(false);
      }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!createForm.domain || !createForm.folder) return;

      const filename = `${createForm.domain}.conf`;
      const content = generateTemplate(createForm.domain, createForm.folder);
      
      setIsSaving(true);
      try {
          await api.admin.apache.createSite(filename, content);
          setSites([...sites, filename]);
          setEditorMode(null);
          setFeedback({ isOpen: true, type: 'success', title: 'Virtual Host Created', message: `Config for ${createForm.domain} created successfully.` });
          loadData();
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Creation Failed', message: e.message });
      } finally {
          setIsSaving(false);
      }
  };

  const handleUpdateSite = async () => {
      if (!currentFileName) return;
      setIsSaving(true);
      try {
          await api.admin.apache.updateSite(currentFileName, editorContent);
          setEditorMode(null);
          setFeedback({ isOpen: true, type: 'success', title: 'Config Updated', message: `Saved changes to ${currentFileName}` });
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Update Failed', message: e.message });
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveHttpd = async () => {
      setIsSaving(true);
      try {
          await api.admin.apache.updateHttpd(httpdContent);
          setFeedback({ isOpen: true, type: 'success', title: 'Saved', message: 'httpd.conf updated successfully.' });
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Error', message: e.message });
      } finally {
          setIsSaving(false);
      }
  };

  // --- HOSTS MANAGEMENT ---
  const handleAddHost = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!hostForm.ip || !hostForm.domain) return;
      setIsSaving(true);
      try {
          await api.admin.apache.addHost(hostForm.ip, hostForm.domain);
          setFeedback({ isOpen: true, type: 'success', title: 'Host Added', message: `${hostForm.domain} mapped to ${hostForm.ip}` });
          setHostForm({ ip: '127.0.0.1', domain: '' });
          loadData();
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Failed', message: e.message });
      } finally {
          setIsSaving(false);
      }
  };

  // --- DELETE LOGIC ---
  const confirmDelete = async () => {
      if (!deleteConfig) return;
      setIsDeleting(true);
      try {
          if (deleteConfig.type === 'SITE') {
              await api.admin.apache.deleteSite(deleteConfig.id);
              setSites(sites.filter(s => s !== deleteConfig.id));
              setFeedback({ isOpen: true, type: 'success', title: 'Deleted', message: 'Config file removed.' });
          } else {
              await api.admin.apache.deleteHost(deleteConfig.id);
              setFeedback({ isOpen: true, type: 'success', title: 'Deleted', message: 'Host entry removed.' });
              loadData();
          }
      } catch (e: any) {
          setFeedback({ isOpen: true, type: 'error', title: 'Delete Failed', message: e.message });
      } finally {
          setIsDeleting(false);
          setDeleteConfig(null);
      }
  };

  // Filter & Pagination Logic
  const filteredItems = activeTab === 'SITES' 
      ? sites.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
      : hostsEntries.filter(h => h.domain.toLowerCase().includes(searchQuery.toLowerCase()) || h.ip.includes(searchQuery));

  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
      
      {/* FEEDBACK POPUP MODAL */}
      {feedback.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={closeFeedback} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                        <button onClick={closeFeedback} className="px-5 py-2 bg-slate-900 text-white rounded-lg font-bold text-sm shadow-md hover:bg-slate-800 transition-all">Close</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
             <Settings className="w-6 h-6 text-indigo-600" /> Apache Configuration
           </h2>
           <p className="text-sm text-slate-500 mt-1">Manage Virtual Hosts, global settings, and Windows Hosts file.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {activeTab !== 'HTTPD' && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder={activeTab === 'SITES' ? "Search config..." : "Search hosts..."} 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    />
                </div>
            )}
            {activeTab === 'SITES' && (
                <button onClick={openCreateModal} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2 whitespace-nowrap">
                    <Plus className="w-4 h-4" /> New Site
                </button>
            )}
        </div>
      </div>

      <div className="flex space-x-1 border-b border-slate-200">
        <button onClick={() => setActiveTab('SITES')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'SITES' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Globe className="w-4 h-4" /> Virtual Hosts
        </button>
        <button onClick={() => setActiveTab('HTTPD')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HTTPD' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Settings className="w-4 h-4" /> httpd.conf
        </button>
        <button onClick={() => setActiveTab('HOSTS')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HOSTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <FileText className="w-4 h-4" /> Windows Hosts
        </button>
      </div>

      {loading ? (
           <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
      ) : activeTab === 'SITES' ? (
          <Card>
            <div className="overflow-x-auto min-h-[400px]">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 font-medium w-16 text-center">#</th>
                            <th className="px-6 py-3 font-medium">Config Filename</th>
                            <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedItems.map((site: any, idx) => (
                            <tr key={site} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4 text-slate-500 font-mono text-xs text-center">{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                                <td className="px-6 py-4 font-mono text-slate-700 font-medium">{site}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => openEditSite(site)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => setDeleteConfig({type: 'SITE', id: site})} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {paginatedItems.length === 0 && <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">No virtual hosts found.</td></tr>}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                    <span className="text-sm text-slate-500">Page {currentPage} of {totalPages}</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border rounded bg-white disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border rounded bg-white disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            )}
          </Card>
      ) : activeTab === 'HOSTS' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                  <Card title="Add Host Entry">
                      <form onSubmit={handleAddHost} className="space-y-4">
                          <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">IP Address</label>
                              <input type="text" value={hostForm.ip} onChange={e => setHostForm({...hostForm, ip: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
                          </div>
                          <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">Domain</label>
                              <input type="text" value={hostForm.domain} onChange={e => setHostForm({...hostForm, domain: e.target.value})} placeholder="example.local" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
                          </div>
                          <button type="submit" disabled={isSaving} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Entry
                          </button>
                      </form>
                  </Card>
              </div>
              <div className="md:col-span-2">
                  <Card title="Windows Hosts File">
                      <div className="overflow-x-auto max-h-[500px]">
                          <table className="min-w-full text-left text-sm">
                              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                  <tr>
                                      <th className="px-6 py-3 font-medium">IP Address</th>
                                      <th className="px-6 py-3 font-medium">Domain</th>
                                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {paginatedItems.map((host: any, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50">
                                          <td className="px-6 py-3 font-mono text-slate-600">{host.ip}</td>
                                          <td className="px-6 py-3 font-bold text-slate-800">{host.domain}</td>
                                          <td className="px-6 py-3 text-right">
                                              <button onClick={() => setDeleteConfig({type: 'HOST', id: host.domain})} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                          </td>
                                      </tr>
                                  ))}
                                  {paginatedItems.length === 0 && <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No host entries found.</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </Card>
              </div>
          </div>
      ) : (
          <Card title="Global Configuration (httpd.conf)">
              <div className="bg-slate-900 rounded-lg p-1 border border-slate-700">
                  <textarea 
                      value={httpdContent}
                      onChange={(e) => setHttpdContent(e.target.value)}
                      className="w-full h-[500px] bg-slate-900 text-slate-300 font-mono text-xs p-4 focus:outline-none resize-y"
                      spellCheck={false}
                  />
              </div>
              <div className="mt-4 flex justify-end">
                  <button onClick={handleSaveHttpd} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50">
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Configuration
                  </button>
              </div>
          </Card>
      )}

      {/* Editor Modal (CREATE/EDIT) */}
      {editorMode && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setEditorMode(null)} />
              <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 flex flex-col h-[85vh]">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                      <h3 className="text-lg font-bold text-slate-900">{editorMode === 'CREATE_SITE' ? 'Create Virtual Host' : `Edit ${currentFileName}`}</h3>
                      <button onClick={() => setEditorMode(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  {editorMode === 'CREATE_SITE' ? (
                      <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col gap-6">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <label className="text-sm font-medium text-slate-700">Server Name (Domain)</label>
                                  <input type="text" value={createForm.domain} onChange={e => setCreateForm({...createForm, domain: e.target.value})} placeholder="app.kolab.top" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-sm font-medium text-slate-700">Document Root Folder</label>
                                  <div className="flex items-center">
                                      <span className="text-slate-500 bg-slate-100 px-3 py-2 border border-r-0 rounded-l-lg text-sm border-slate-300">Z:/www/</span>
                                      <input type="text" value={createForm.folder} onChange={e => setCreateForm({...createForm, folder: e.target.value})} placeholder="myproject" className="flex-1 px-3 py-2 border rounded-r-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
                                  </div>
                              </div>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex-1 flex flex-col">
                              <label className="text-xs font-bold text-slate-500 uppercase mb-2">Preview Config</label>
                              <pre className="font-mono text-xs text-slate-700 whitespace-pre-wrap bg-white p-3 rounded border border-slate-200 flex-1 overflow-auto">
                                  {generateTemplate(createForm.domain || '...', createForm.folder || '...')}
                              </pre>
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                              <button type="button" onClick={() => setEditorMode(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                              <button type="submit" disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">{isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
                          </div>
                      </form>
                  ) : (
                      <>
                          <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden mb-4">
                              <textarea value={editorContent} onChange={(e) => setEditorContent(e.target.value)} className="w-full h-full bg-slate-900 text-emerald-400 font-mono text-sm p-4 focus:outline-none resize-none" spellCheck={false} />
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                              <button onClick={() => setEditorMode(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                              <button onClick={handleUpdateSite} disabled={isSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">{isSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes</button>
                          </div>
                      </>
                  )}
              </div>
          </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfig && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setDeleteConfig(null)} />
              <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in zoom-in-95">
                  <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-100 rounded-full shrink-0"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-900">Confirm Deletion</h3>
                          <p className="text-sm text-slate-500 mt-1">
                              Are you sure you want to delete {deleteConfig.type === 'SITE' ? 'config' : 'host entry'} <span className="font-bold text-slate-900">{deleteConfig.id}</span>?
                          </p>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setDeleteConfig(null)} disabled={isDeleting} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm">Cancel</button>
                      <button onClick={confirmDelete} disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 flex items-center gap-2">
                          {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
