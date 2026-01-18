import React, { useState } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { api } from '../../services/api';
import { User, HostingPlan, Site, SiteStatus } from '../../types';
import { Globe, HardDrive, Crown, Zap, Server, Cloud, ExternalLink, Trash2, Edit2, Save, X, AlertTriangle, Database, Loader2, CheckCircle2, AlertOctagon, Clock, ArrowRight } from 'lucide-react';
import { FRAMEWORK_ICONS } from '../../constants';

interface DashboardProps {
  sites: Site[];
  user: User;
  plans: HostingPlan[];
  onRefresh?: () => void;
}

export const UserDashboardHome: React.FC<DashboardProps> = ({ sites = [], user, plans = [], onRefresh }) => {
  const [showAllSites, setShowAllSites] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubdomain, setEditSubdomain] = useState('');

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleteWithDb, setDeleteWithDb] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStage, setDeleteStage] = useState('');

  // Robust safety checks
  const safePlans = Array.isArray(plans) ? plans : [];
  const safeSites = Array.isArray(sites) ? sites : [];
  const safeUser = user || { plan: 'Basic', username: 'Guest' } as User;

  // FILTER: Only show active web sites (exclude detached DBs)
  const displaySites = safeSites.filter(s => s.status !== SiteStatus.DB_ONLY);

  const currentPlan = safePlans.find(p => p.name === safeUser.plan);
  const maxSites = currentPlan?.limits?.sites || 0;
  const maxStorage = currentPlan?.limits?.storage || 0;
  
  const usedSites = displaySites.length;
  const usedStorage = displaySites.reduce((acc, s) => acc + (s.storageUsed || 0), 0);

  const sitesPercentage = maxSites > 0 ? (usedSites / maxSites) * 100 : 0;
  const storagePercentage = maxStorage > 0 ? (usedStorage / maxStorage) * 100 : 0;

  // --- STORAGE WARNING LOGIC ---
  const isStorageCritical = storagePercentage > 100;
  const isStorageWarning = storagePercentage >= 80 && !isStorageCritical;

  const storageConfig = isStorageCritical 
    ? {
        gradient: 'from-red-600 to-rose-600',
        icon: AlertOctagon,
        textColor: 'text-red-100',
        titleColor: 'text-red-50',
        progressColor: 'bg-white',
        statusText: 'OVER LIMIT',
        iconBg: 'bg-white/20 border-white/20',
        pulse: true
      }
    : isStorageWarning
    ? {
        gradient: 'from-amber-500 to-orange-600',
        icon: AlertTriangle,
        textColor: 'text-orange-100',
        titleColor: 'text-orange-50',
        progressColor: 'bg-white',
        statusText: 'NEAR FULL',
        iconBg: 'bg-black/10 border-black/5',
        pulse: false
      }
    : {
        gradient: 'from-emerald-600 to-teal-500',
        icon: Cloud,
        textColor: 'text-emerald-100',
        titleColor: 'text-emerald-50',
        progressColor: 'bg-white',
        statusText: 'HEALTHY',
        iconBg: 'bg-white/20 border-white/10',
        pulse: false
      };

  const StorageIcon = storageConfig.icon;

  // --- EXISTING HANDLERS ---
  const startEdit = (site: Site) => {
    setEditingId(site.id);
    setEditSubdomain(site.subdomain);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSubdomain('');
  };

  const saveEdit = async (siteId: string) => {
    if (!editSubdomain.trim()) return;
    try {
        await api.sites.update(siteId, { subdomain: editSubdomain.trim() });
        if (onRefresh) onRefresh();
        setEditingId(null);
    } catch (e) {
        alert("Failed to update site url");
    }
  };

  const initiateDelete = (site: Site) => {
      setDeleteTarget(site);
      setDeleteWithDb(false); 
      setDeleteProgress(0);
      setDeleteStage('');
      setIsDeleting(false);
  };

  const confirmDelete = async () => {
      if (!deleteTarget) return;
      
      setIsDeleting(true);
      
      try {
          // 1. Stopping Services
          setDeleteStage('Stopping Application Services...');
          setDeleteProgress(15);
          await new Promise(r => setTimeout(r, 800));

          // 2. Unlinking
          setDeleteStage('Unlinking Domain & SSL...');
          setDeleteProgress(40);
          await new Promise(r => setTimeout(r, 800));

          // 3. Deleting Files
          setDeleteStage('Pruning File System...');
          setDeleteProgress(65);
          await new Promise(r => setTimeout(r, 1200));

          // 4. Database (Optional)
          if (deleteWithDb) {
              setDeleteStage('Dropping MySQL Database...');
              setDeleteProgress(85);
              await new Promise(r => setTimeout(r, 1000));
          }

          // 5. Final API Call & Cleanup
          setDeleteStage('Finalizing Cleanup...');
          setDeleteProgress(95);
          
          await api.sites.delete(deleteTarget.id, deleteWithDb);
          
          setDeleteProgress(100);
          setDeleteStage('Deletion Complete');
          await new Promise(r => setTimeout(r, 500)); // Small delay to show 100%

          if (onRefresh) onRefresh();
          setDeleteTarget(null);
      } catch (e) {
          alert("Failed to delete site");
          setIsDeleting(false);
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* CRITICAL STORAGE ALERT BANNER */}
      {isStorageCritical && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm animate-in slide-in-from-top-4 flex flex-col md:flex-row items-start gap-4">
            <div className="p-3 bg-red-100 rounded-full shrink-0 animate-pulse">
                <Clock className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                    Action Required: Storage Limit Exceeded
                </h3>
                <p className="text-sm text-red-700 mt-1 leading-relaxed">
                    You have exceeded your allocated storage limit of <span className="font-bold">{maxStorage} MB</span>. 
                    Please upgrade your plan or clear unnecessary files immediately.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-800 rounded-lg text-xs font-bold border border-red-200">
                    <AlertOctagon className="w-3.5 h-3.5" />
                    AUTOMATIC SUSPENSION IN 24 HOURS
                </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
                <button 
                    onClick={() => window.location.hash = '#/BILLING'} // Quick hack nav, ideally use a prop function
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm shadow-sm transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                >
                    Upgrade Plan <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Sites Card */}
        <div className="bg-gradient-to-br from-blue-600 to-cyan-500 p-6 rounded-xl shadow-lg text-white relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 text-white/10 rotate-12 transition-transform group-hover:scale-105 duration-500">
                <Globe className="w-32 h-32" />
            </div>
            <div className="relative z-10 flex items-center justify-between mb-4">
                <h3 className="text-blue-100 font-medium text-sm">Active Sites</h3>
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm border border-white/10">
                    <Server className="w-5 h-5 text-white" />
                </div>
            </div>
            <div className="relative z-10">
                <div className="flex items-baseline gap-1">
                   <span className="text-3xl font-bold tracking-tight">{usedSites}</span>
                   <span className="text-lg text-blue-200">/ {maxSites}</span>
                </div>
                <div className="mt-4 space-y-2">
                    <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden backdrop-blur-sm">
                        <div style={{ width: `${Math.min(sitesPercentage, 100)}%` }} className="bg-white h-full rounded-full transition-all duration-1000 ease-out" />
                    </div>
                    <p className="text-xs text-blue-100 font-medium">{maxSites - usedSites} slots remaining</p>
                </div>
            </div>
        </div>

        {/* Storage Used Card (Dynamic Styling) */}
        <div className={`bg-gradient-to-br ${storageConfig.gradient} p-6 rounded-xl shadow-lg text-white relative overflow-hidden group transition-all duration-500`}>
            <div className="absolute -right-6 -bottom-6 text-white/10 rotate-12 transition-transform group-hover:scale-105 duration-500">
                <HardDrive className="w-32 h-32" />
            </div>
            {storageConfig.pulse && <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />}
            
            <div className="relative z-10 flex items-center justify-between mb-4">
                <h3 className={`${storageConfig.titleColor} font-medium text-sm`}>Storage Usage</h3>
                <div className={`p-2 rounded-lg backdrop-blur-sm ${storageConfig.iconBg}`}>
                    <StorageIcon className="w-5 h-5 text-white" />
                </div>
            </div>
            <div className="relative z-10">
                <div className="flex items-baseline gap-1">
                   <span className="text-3xl font-bold tracking-tight">{usedStorage.toFixed(0)}</span>
                   <span className={`text-sm font-medium ${storageConfig.textColor}`}>MB</span>
                   <span className={`text-lg ml-1 opacity-70`}>/ {maxStorage} MB</span>
                </div>
                <div className="mt-4 space-y-2">
                    <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden backdrop-blur-sm">
                        <div 
                            style={{ width: `${Math.min(storagePercentage, 100)}%` }} 
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${storageConfig.progressColor}`} 
                        />
                    </div>
                    <div className="flex justify-between items-center">
                        <p className={`text-xs font-medium ${storageConfig.textColor}`}>{storagePercentage.toFixed(1)}% used</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 ${storageConfig.textColor}`}>{storageConfig.statusText}</span>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Active Plan Card */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 rounded-xl shadow-lg text-white relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 text-white/10 rotate-12 transition-transform group-hover:scale-105 duration-500">
                <Crown className="w-32 h-32" />
            </div>
            <div className="relative z-10 flex items-center justify-between mb-4">
                <h3 className="text-indigo-100 font-medium text-sm">Current Plan</h3>
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm border border-white/10">
                    <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                </div>
            </div>
            <div className="relative z-10 mt-auto">
                <div className="text-3xl font-bold tracking-tight">{safeUser.plan}</div>
                <div className="flex items-center gap-1.5 text-indigo-200 text-xs mt-2 font-medium">
                     <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                     </span>
                     Active Subscription
                </div>
                <div className="mt-4 h-6"></div> 
            </div>
        </div>
      </div>

      <Card title="My Sites" action={
          <div className="flex gap-2">
            <button 
                onClick={() => setShowAllSites(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors flex items-center gap-1"
            >
                View All
            </button>
          </div>
      }>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="px-4 py-3 font-medium">Site Name</th>
                <th className="px-4 py-3 font-medium">Framework</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Deployment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displaySites.length > 0 ? displaySites.slice(0, 5).map(site => {
                  return (
                    <tr key={site.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{site.name}</td>
                        <td className="px-4 py-3 text-slate-600">{site.framework}</td>
                        <td className="px-4 py-3">
                            <a 
                                href={`https://${site.subdomain}.kolabpanel.com`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors font-medium text-xs flex items-center gap-1 w-fit"
                            >
                                <Globe className="w-3 h-3" />
                                {site.subdomain}.kolabpanel.com
                            </a>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={site.status} /></td>
                    </tr>
                  )
              }) : (
                <tr>
                   <td colSpan={4} className="px-4 py-6 text-center text-slate-500 italic">No sites found. Click "New Site" to deploy.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* All Sites Modal */}
      {showAllSites && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAllSites(false)} />
           <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div>
                    <h3 className="text-xl font-bold text-slate-900">All Active Sites</h3>
                    <p className="text-sm text-slate-500">Manage, edit, and view all your deployed applications.</p>
                 </div>
                 <button onClick={() => setShowAllSites(false)} className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                 <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                       <tr>
                          <th className="px-6 py-4 font-medium">Application</th>
                          <th className="px-6 py-4 font-medium">URL</th>
                          <th className="px-6 py-4 font-medium">Created At</th>
                          <th className="px-6 py-4 font-medium">Storage</th>
                          <th className="px-6 py-4 font-medium">System Status</th>
                          <th className="px-6 py-4 font-medium text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {displaySites.map(site => {
                          return (
                          <tr key={site.id} className="hover:bg-slate-50 transition-colors group">
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                   <div className={`p-2 rounded-lg bg-white border border-slate-200 shadow-sm ${FRAMEWORK_ICONS[site.framework] || 'text-slate-500'}`}>
                                      <Globe className="w-5 h-5" />
                                   </div>
                                   <div>
                                      <div className="font-semibold text-slate-900">{site.name}</div>
                                      <div className="text-xs text-slate-500">{site.framework}</div>
                                   </div>
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                    {editingId === site.id ? (
                                        <div className="flex items-center">
                                            <input type="text" value={editSubdomain} onChange={(e) => setEditSubdomain(e.target.value)} className="px-2 py-1 text-xs border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-200 outline-none w-24" autoFocus />
                                            <span className="text-xs text-slate-500 ml-1">.kolabpanel.com</span>
                                        </div>
                                    ) : (
                                        <a 
                                        href={`https://${site.subdomain}.kolabpanel.com`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-indigo-600 font-mono text-xs bg-indigo-50 px-2 py-1 rounded hover:underline hover:text-indigo-800 transition-colors w-fit flex items-center gap-1"
                                        >
                                            <Globe className="w-3 h-3" />
                                            {site.subdomain}.kolabpanel.com
                                        </a>
                                    )}
                                </div>
                             </td>
                             <td className="px-6 py-4 text-slate-600">{new Date(site.createdAt).toLocaleDateString()}</td>
                             <td className="px-6 py-4 text-slate-600">{(site.storageUsed || 0).toFixed(2)} MB</td>
                             <td className="px-6 py-4"><StatusBadge status={site.status} /></td>
                             <td className="px-6 py-4 text-right">
                                <div className="flex justify-end items-center gap-2">
                                   {editingId === site.id ? (
                                       <>
                                           <button onClick={() => saveEdit(site.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Save"><Save className="w-4 h-4" /></button>
                                           <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                                       </>
                                   ) : (
                                       <>
                                           <button className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Edit URL" onClick={() => startEdit(site)}><Edit2 className="w-4 h-4" /></button>
                                           <button className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete Site" onClick={() => initiateDelete(site)}><Trash2 className="w-4 h-4" /></button>
                                           <button className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"><ExternalLink className="w-3 h-3" /> Visit</button>
                                       </>
                                   )}
                                </div>
                             </td>
                          </tr>
                       )})}
                       {displaySites.length === 0 && (
                          <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500"><Server className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p>No active sites found.</p></td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
                  <span>Showing {displaySites.length} active sites</span>
                  <span>Limits: {usedSites} / {maxSites} used</span>
              </div>
           </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Now with Interactive Progress) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDeleting && setDeleteTarget(null)} />
            <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                {isDeleting ? (
                    <div className="flex flex-col items-center text-center py-6">
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 relative">
                            {deleteProgress === 100 ? (
                                <CheckCircle2 className="w-10 h-10 text-red-600 animate-in zoom-in spin-in-12" />
                            ) : (
                                <>
                                    <Trash2 className="w-8 h-8 text-red-500 z-10" />
                                    <div className="absolute inset-0 border-4 border-red-100 border-t-red-500 rounded-full animate-spin"></div>
                                </>
                            )}
                        </div>
                        
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{deleteStage}</h3>
                        <p className="text-sm text-slate-500 mb-8 max-w-[250px] mx-auto leading-relaxed">
                            Please wait while we securely remove your site resources...
                        </p>
                        
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2">
                            <div 
                                style={{ width: `${deleteProgress}%` }} 
                                className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                            />
                        </div>
                        <div className="flex justify-between w-full text-xs font-bold text-slate-400 px-1">
                             <span>Progress</span>
                             <span>{deleteProgress}%</span>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 rounded-full shrink-0"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Delete Site?</h3>
                                <p className="text-sm text-slate-500 mt-1">Are you sure you want to delete <span className="font-bold text-slate-800">{deleteTarget.name}</span>? This action will permanently remove all files.</p>
                                
                                {deleteTarget.hasDatabase && (
                                    <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        <div className="flex items-start gap-3">
                                            <input 
                                                type="checkbox" 
                                                id="deleteDb"
                                                checked={deleteWithDb}
                                                onChange={(e) => setDeleteWithDb(e.target.checked)}
                                                className="mt-1 w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                                            />
                                            <label htmlFor="deleteDb" className="text-sm text-slate-700 cursor-pointer">
                                                <div className="font-semibold flex items-center gap-1.5">
                                                    <Database className="w-3.5 h-3.5" />
                                                    Delete associated MySQL Database?
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    If unchecked, the database will be preserved.
                                                </div>
                                                {deleteWithDb && (
                                                    <div className="mt-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded inline-block">
                                                        Warning: Database data will be lost.
                                                    </div>
                                                )}
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors">
                                {deleteWithDb ? 'Delete Site & DB' : (deleteTarget.hasDatabase ? 'Delete Site Only' : 'Delete Site')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
      )}
    </div>
  );
};