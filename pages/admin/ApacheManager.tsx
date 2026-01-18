import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Shared';
import { api } from '../../services/api';
import { FileCode, Settings, RefreshCw, Plus, Trash2, Edit2, Save, X, Loader2, AlertTriangle, CheckCircle, AlertOctagon, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const ITEMS_PER_PAGE = 25;

export const ApacheManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SITES' | 'HTTPD'>('SITES');
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  
  // Data State
  const [sites, setSites] = useState<string[]>([]);
  const [httpdContent, setHttpdContent] = useState('');
  
  // Pagination & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Editor State
  const [editorMode, setEditorMode] = useState<'EDIT_SITE' | 'CREATE_SITE' | null>(null);
  const [currentFileName, setCurrentFileName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete State
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
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
  }, [activeTab]);

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const loadData = async () => {
    setLoading(true);
    try {
        if (activeTab === 'SITES') {
            const data = await api.admin.apache.listSites();
            setSites(data);
        } else {
            const data = await api.admin.apache.getHttpd();
            setHttpdContent(data.content);
        }
    } catch (e) {
        console.error("Failed to load apache data", e);
    } finally {
        setLoading(false);
    }
  };

  const handleReloadApache = async () => {
      setReloading(true);
      try {
          await api.admin.apache.reload();
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Apache Reloaded',
              message: 'The Apache service has been reloaded successfully.'
          });
      } catch (e: any) {
          setFeedback({
              isOpen: true,
              type: 'error',
              title: 'Reload Failed',
              message: e.message || 'Failed to reload Apache service.'
          });
      } finally {
          setReloading(false);
      }
  };

  const openCreateModal = () => {
      setEditorMode('CREATE_SITE');
      setCurrentFileName('');
      setEditorContent(`<VirtualHost *:9029>
    ServerName hasiluid.kolab.top
    ServerAlias hasiluid.kolab.top
    DocumentRoot "Z:/www/hasiluid"
    <Directory "Z:/www/hasiluid">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html
    </Directory>
</VirtualHost>`);
  };

  const openEditSite = async (filename: string) => {
      try {
          setLoading(true);
          const data = await api.admin.apache.getSite(filename);
          setCurrentFileName(filename);
          setEditorContent(data.content);
          setEditorMode('EDIT_SITE');
      } catch (e) {
          alert("Failed to load site config");
      } finally {
          setLoading(false);
      }
  };

  const handleSaveSite = async () => {
      if (!currentFileName.trim()) return;
      setIsSaving(true);
      try {
          let successMessage = "";
          if (editorMode === 'CREATE_SITE') {
              // Automatically append .test.conf suffix if not present
              let finalName = currentFileName.trim();
              
              await api.admin.apache.createSite(finalName, editorContent);
              setSites([...sites, finalName]); // Ideally should refresh list from API
              successMessage = `Virtual Host "${finalName}" created successfully.`;
          } else {
              await api.admin.apache.updateSite(currentFileName, editorContent);
              successMessage = `Configuration for "${currentFileName}" updated successfully.`;
          }
          setEditorMode(null);
          loadData(); // Refresh list to be sure
          
          // Show Success Popup
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Configuration Saved',
              message: successMessage
          });

      } catch (e: any) {
          setFeedback({
              isOpen: true,
              type: 'error',
              title: 'Save Failed',
              message: e.message || "An error occurred while saving the configuration."
          });
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveHttpd = async () => {
      setIsSaving(true);
      try {
          await api.admin.apache.updateHttpd(httpdContent);
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Configuration Saved',
              message: 'Global Apache configuration (httpd.conf) has been successfully saved.'
          });
      } catch (e: any) {
          setFeedback({
              isOpen: true,
              type: 'error',
              title: 'Save Failed',
              message: e.message || "Failed to update global configuration."
          });
      } finally {
          setIsSaving(false);
      }
  };

  const confirmDelete = async () => {
      if (!fileToDelete) return;
      setIsDeleting(true);
      try {
          await api.admin.apache.deleteSite(fileToDelete);
          setSites(sites.filter(s => s !== fileToDelete));
          setFileToDelete(null);
          setFeedback({
              isOpen: true,
              type: 'success',
              title: 'Config Deleted',
              message: `The configuration file "${fileToDelete}" has been removed.`
          });
      } catch (e: any) {
          setFeedback({
              isOpen: true,
              type: 'error',
              title: 'Delete Failed',
              message: e.message
          });
      } finally {
          setIsDeleting(false);
      }
  };

  // Filter & Pagination Logic
  const filteredSites = sites.filter(site => 
      site.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalItems = filteredSites.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedSites = filteredSites.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

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
             <Settings className="w-6 h-6 text-indigo-600" /> Apache Configuration
           </h2>
           <p className="text-sm text-slate-500 mt-1">Manage Virtual Hosts and global server settings.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {activeTab === 'SITES' && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search config..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full sm:w-64 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    />
                </div>
            )}

            <div className="flex gap-2">
                <button 
                    onClick={handleReloadApache} 
                    disabled={reloading}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap"
                >
                    <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
                    {reloading ? 'Reloading...' : 'Reload'}
                </button>
                {activeTab === 'SITES' && (
                    <button 
                        onClick={openCreateModal}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" /> New Site
                    </button>
                )}
            </div>
        </div>
      </div>

      <div className="flex space-x-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('SITES')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'SITES' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <FileCode className="w-4 h-4" /> Virtual Hosts
        </button>
        <button
          onClick={() => setActiveTab('HTTPD')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HTTPD' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Settings className="w-4 h-4" /> httpd.conf
        </button>
      </div>

      {loading && !reloading ? (
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
                        {paginatedSites.map((site, idx) => (
                            <tr key={site} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4 text-slate-500 font-mono text-xs text-center">
                                    {(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}
                                </td>
                                <td className="px-6 py-4 font-mono text-slate-700 font-medium">{site}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => openEditSite(site)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Config">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setFileToDelete(site)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Config">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {paginatedSites.length === 0 && (
                            <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic">No virtual hosts found matching your criteria.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                    <span className="text-sm text-slate-500">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} configs
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
          </Card>
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
                  <button 
                      onClick={handleSaveHttpd} 
                      disabled={isSaving}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                  >
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Configuration
                  </button>
              </div>
          </Card>
      )}

      {/* Editor Modal */}
      {editorMode && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setEditorMode(null)} />
              <div className="relative w-full max-w-6xl bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[90vh]">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                      <h3 className="text-lg font-bold text-slate-900">{editorMode === 'CREATE_SITE' ? 'Create Virtual Host' : `Edit ${currentFileName}`}</h3>
                      <button onClick={() => setEditorMode(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  {editorMode === 'CREATE_SITE' && (
                      <div className="mb-4 shrink-0">
                          <label className="text-sm font-medium text-slate-700 mb-1 block">Filename</label>
                          <div className="flex items-center">
                              <input 
                                  type="text" 
                                  value={currentFileName} 
                                  onChange={(e) => setCurrentFileName(e.target.value)}
                                  placeholder="mysite.test.conf" 
                                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                          </div>
                      </div>
                  )}

                  <div className="flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                      <textarea 
                          value={editorContent}
                          onChange={(e) => setEditorContent(e.target.value)}
                          className="w-full h-full bg-slate-900 text-emerald-400 font-mono text-sm p-4 focus:outline-none resize-none"
                          spellCheck={false}
                      />
                  </div>

                  <div className="pt-4 flex justify-end gap-3 shrink-0">
                      <button onClick={() => setEditorMode(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                      <button 
                          onClick={handleSaveSite} 
                          disabled={isSaving || !currentFileName}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Config
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Confirmation */}
      {fileToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setFileToDelete(null)} />
              <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-4">
                      <div className="p-3 bg-red-100 rounded-full shrink-0"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-900">Delete Config?</h3>
                          <p className="text-sm text-slate-500 mt-1">Are you sure you want to delete <span className="font-mono font-bold text-slate-800">{fileToDelete}</span>?</p>
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-100">Apache will be automatically validated.</p>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setFileToDelete(null)} disabled={isDeleting} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                      <button onClick={confirmDelete} disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2">
                          {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};