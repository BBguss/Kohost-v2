import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../Shared';
import { Framework, Domain, Site, SiteStatus, User, HostingPlan } from '../../types';
import { Upload, FileArchive, Check, Loader2, Database, Link, Plus, Unlink, CheckCircle2, Circle, FileText, Server, Globe, Lock, Zap, ArrowRight, FileCog } from 'lucide-react';
import { api } from '../../services/api';

interface CreateSiteProps {
  domains: Domain[];
  onDeploy: () => void;
  user?: User;
  sites?: Site[];
  plans?: HostingPlan[];
  onUpgrade?: () => void;
}

type DbMode = 'NONE' | 'NEW' | 'ATTACH';
type DeployStage = 'IDLE' | 'UPLOADING' | 'EXTRACTING' | 'CONFIGURING' | 'FINALIZING';

export const CreateSite: React.FC<CreateSiteProps> = ({ domains, onDeploy, user, sites = [], plans = [], onUpgrade }) => {
  const [deployStage, setDeployStage] = useState<DeployStage>('IDLE');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractProgress, setExtractProgress] = useState(0); // New state for extraction
  
  // Form State
  const [name, setName] = useState('');
  const [framework, setFramework] = useState<Framework>(Framework.REACT);
  const [subdomain, setSubdomain] = useState('');
  const [selectedDomain, setSelectedDomain] = useState(domains[0]?.name || 'kolabpanel.com');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // DB State
  const [dbMode, setDbMode] = useState<DbMode>('NONE');
  const [orphanedDbs, setOrphanedDbs] = useState<Site[]>([]);
  const [selectedOrphanId, setSelectedOrphanId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- LIMIT CHECK LOGIC ---
  const activeSites = sites.filter(s => s.status !== SiteStatus.DB_ONLY);
  const currentPlan = plans.find(p => p.name === user?.plan);
  const siteLimit = currentPlan?.limits?.sites || 0;
  const isLimitReached = activeSites.length >= siteLimit;

  // Fetch Orphaned Databases on mount
  useEffect(() => {
    const fetchOrphans = async () => {
        try {
            const currentUser = await api.auth.me();
            const allSites = await api.sites.list(currentUser.id);
            const orphans = allSites.filter(s => s.status === SiteStatus.DB_ONLY);
            setOrphanedDbs(orphans);
        } catch (e) {
            console.error("Failed to fetch sites", e);
        }
    };
    fetchOrphans();
  }, [deployStage]);

  // Simulate extraction progress when stage is EXTRACTING
  useEffect(() => {
      if (deployStage === 'EXTRACTING') {
          setExtractProgress(0);
          const interval = setInterval(() => {
              setExtractProgress(prev => {
                  if (prev >= 95) {
                      clearInterval(interval);
                      return 95;
                  }
                  return prev + Math.floor(Math.random() * 5) + 1; // Random increment
              });
          }, 300); // Fast ticks
          return () => clearInterval(interval);
      }
  }, [deployStage]);

  const validateAndSetFile = (selectedFile: File) => {
    setError('');
    const isZip = selectedFile.name.toLowerCase().endsWith('.zip') || 
                  selectedFile.type === 'application/zip' || 
                  selectedFile.type === 'application/x-zip-compressed';

    if (!isZip) {
      setError('Invalid file format. Only .zip files are allowed.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (deployStage === 'IDLE') setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (deployStage !== 'IDLE') return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles && droppedFiles.length > 0) {
          validateAndSetFile(droppedFiles[0]);
      }
  };

  const simulateUpload = async () => {
      for (let i = 0; i <= 100; i += 8) {
          setUploadProgress(i);
          await new Promise(r => setTimeout(r, 100)); // fast simulation
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!file || !name || !subdomain) {
      setError('Please fill in all fields and upload a file.');
      return;
    }
    if (dbMode === 'ATTACH' && !selectedOrphanId) {
        setError('Please select a database to connect.');
        return;
    }

    const userData = await api.auth.me();
    const formData = new FormData();
    formData.append('userId', userData.id);
    formData.append('name', name);
    formData.append('framework', framework);
    formData.append('subdomain', `${subdomain}.${selectedDomain}`);
    formData.append('needsDatabase', String(dbMode === 'NEW'));
    if (dbMode === 'ATTACH') formData.append('attachedDatabaseId', selectedOrphanId);
    formData.append('file', file);

    try {
        setDeployStage('UPLOADING');
        await simulateUpload();
        
        setDeployStage('EXTRACTING');
        // The API call will block until extraction is done on server
        await api.sites.deploy(formData); 
        
        setExtractProgress(100); // Jump to 100 on success
        await new Promise(r => setTimeout(r, 500)); // Brief pause to show completion

        setDeployStage('CONFIGURING');
        await new Promise(r => setTimeout(r, 800));
        
        setDeployStage('FINALIZING');
        await new Promise(r => setTimeout(r, 800));

        // Success
        setDeployStage('IDLE');
        alert(`Site "${name}" successfully deployed!`);
        onDeploy();
        
        // Reset
        setName('');
        setSubdomain('');
        setDbMode('NONE');
        setSelectedOrphanId('');
        setFile(null);
        setUploadProgress(0);
        setExtractProgress(0);
    } catch (e: any) {
        setError(e.message || 'Deployment failed');
        setDeployStage('IDLE');
        setUploadProgress(0);
        setExtractProgress(0);
    }
  };

  const steps = [
      { id: 'UPLOADING', label: 'Uploading Archive', icon: Upload },
      { id: 'EXTRACTING', label: 'Extracting & Validating', icon: FileArchive },
      { id: 'CONFIGURING', label: 'Configuring Nginx & SSL', icon: Server },
      { id: 'FINALIZING', label: 'Finalizing Deployment', icon: Globe },
  ];

  const getCurrentStepIndex = () => steps.findIndex(s => s.id === deployStage);

  // --- RENDER: LIMIT REACHED VIEW ---
  if (isLimitReached && deployStage === 'IDLE') {
    return (
        <div className="max-w-xl mx-auto mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-center text-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="p-4 bg-white/10 rounded-full mb-4 backdrop-blur-sm border border-white/20">
                            <Lock className="w-10 h-10 text-amber-400" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Limit Reached</h2>
                        <p className="text-slate-300 text-sm max-w-sm">
                            You have used <span className="text-white font-bold">{activeSites.length}</span> of <span className="text-white font-bold">{siteLimit}</span> available slots on your <span className="text-amber-400 font-semibold">{user?.plan}</span> plan.
                        </p>
                    </div>
                </div>
                <div className="p-8 text-center">
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-slate-600 text-sm">
                            To deploy more sites, please upgrade your hosting plan. Premium plans include unlimited sites and increased storage.
                        </p>
                        
                        <div className="w-full h-px bg-slate-100 my-2"></div>

                        <button 
                            onClick={onUpgrade}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group"
                        >
                            <Zap className="w-4 h-4 fill-yellow-400 text-yellow-400 group-hover:animate-pulse" />
                            Upgrade Plan Now
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                        
                        <button onClick={() => window.history.back()} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // --- RENDER: PROGRESS VIEW ---
  if (deployStage !== 'IDLE') {
      return (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
              <Card>
                  <div className="py-8 px-4 flex flex-col items-center">
                      <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 relative">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                          <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                      </div>
                      <h2 className="text-xl font-bold text-slate-800 mb-2">Deploying {name}...</h2>
                      <p className="text-slate-500 text-sm mb-8">Please wait while we set up your environment.</p>

                      <div className="w-full max-w-md space-y-6">
                          {/* Progress Bar for Upload */}
                          {deployStage === 'UPLOADING' && (
                              <div className="space-y-2 mb-6 animate-in slide-in-from-bottom-2">
                                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                                      <span>Uploading {file?.name}</span>
                                      <span>{uploadProgress}%</span>
                                  </div>
                                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${uploadProgress}%` }}
                                      />
                                  </div>
                              </div>
                          )}

                          {/* Progress Bar for Extraction */}
                          {deployStage === 'EXTRACTING' && (
                              <div className="space-y-2 mb-6 animate-in slide-in-from-bottom-2">
                                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                                      <span className="flex items-center gap-1"><FileCog className="w-3 h-3" /> Extracting & Processing Files...</span>
                                      <span>{extractProgress}%</span>
                                  </div>
                                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                                      <div 
                                        className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                                        style={{ width: `${extractProgress}%` }}
                                      >
                                          <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1s_infinite] -skew-x-12"></div>
                                      </div>
                                  </div>
                                  <p className="text-[10px] text-slate-400 text-center pt-1">Large archives may take a moment to unpack on the server.</p>
                              </div>
                          )}

                          {/* Steps */}
                          <div className="space-y-4">
                              {steps.map((step, idx) => {
                                  const currentIndex = getCurrentStepIndex();
                                  const isCompleted = idx < currentIndex;
                                  const isCurrent = idx === currentIndex;
                                  
                                  return (
                                      <div key={step.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all duration-300 ${isCurrent ? 'bg-indigo-50 border-indigo-200 scale-[1.02] shadow-sm' : 'bg-white border-transparent opacity-60'}`}>
                                          <div className={`p-2 rounded-full shrink-0 ${isCompleted ? 'bg-emerald-100 text-emerald-600' : isCurrent ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                              {isCompleted ? <Check className="w-4 h-4" /> : isCurrent ? <step.icon className="w-4 h-4 animate-pulse" /> : <step.icon className="w-4 h-4" />}
                                          </div>
                                          <div className="flex-1">
                                              <p className={`text-sm font-medium ${isCurrent ? 'text-indigo-900' : 'text-slate-700'}`}>{step.label}</p>
                                          </div>
                                          {isCurrent && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                                          {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>
              </Card>
          </div>
      );
  }

  // --- RENDER: FORM VIEW ---
  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card title="Deploy New Site">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Project Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                placeholder="My Awesome Project" 
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Framework</label>
              <select 
                value={framework}
                onChange={(e) => setFramework(e.target.value as Framework)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {Object.values(Framework).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Subdomain & Domain</label>
            <div className="flex">
              <input 
                type="text" 
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                className="flex-1 px-3 py-2 border border-r-0 border-slate-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                placeholder="project-name" 
                required 
              />
              <div className="bg-slate-100 border border-slate-300 rounded-r-lg flex items-center px-2">
                <span className="text-slate-500 text-sm font-medium mr-1">.</span>
                <select 
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-transparent border-none text-sm text-slate-700 font-medium outline-none focus:ring-0 cursor-pointer py-1"
                >
                  {domains.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Database Configuration Section */}
          <div className="space-y-3">
             <label className="text-sm font-medium text-slate-700">Database Configuration</label>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div 
                    onClick={() => setDbMode('NONE')}
                    className={`cursor-pointer p-3 rounded-lg border-2 transition-all flex flex-col items-center text-center gap-2 ${dbMode === 'NONE' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                >
                    <div className={`p-2 rounded-full ${dbMode === 'NONE' ? 'bg-indigo-200' : 'bg-slate-100'}`}>
                        <Database className={`w-4 h-4 ${dbMode === 'NONE' ? 'text-indigo-700' : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-xs font-bold ${dbMode === 'NONE' ? 'text-indigo-700' : 'text-slate-600'}`}>No Database</span>
                </div>
                <div 
                    onClick={() => setDbMode('NEW')}
                    className={`cursor-pointer p-3 rounded-lg border-2 transition-all flex flex-col items-center text-center gap-2 ${dbMode === 'NEW' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                >
                    <div className={`p-2 rounded-full ${dbMode === 'NEW' ? 'bg-indigo-200' : 'bg-slate-100'}`}>
                        <Plus className={`w-4 h-4 ${dbMode === 'NEW' ? 'text-indigo-700' : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-xs font-bold ${dbMode === 'NEW' ? 'text-indigo-700' : 'text-slate-600'}`}>Create New</span>
                </div>
                {orphanedDbs.length > 0 ? (
                     <div 
                        onClick={() => setDbMode('ATTACH')}
                        className={`cursor-pointer p-3 rounded-lg border-2 transition-all flex flex-col items-center text-center gap-2 ${dbMode === 'ATTACH' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                    >
                        <div className={`p-2 rounded-full ${dbMode === 'ATTACH' ? 'bg-indigo-200' : 'bg-slate-100'}`}>
                            <Link className={`w-4 h-4 ${dbMode === 'ATTACH' ? 'text-indigo-700' : 'text-slate-400'}`} />
                        </div>
                        <div className="flex flex-col">
                             <span className={`text-xs font-bold ${dbMode === 'ATTACH' ? 'text-indigo-700' : 'text-slate-600'}`}>Connect Existing</span>
                             <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">{orphanedDbs.length} Available</span>
                        </div>
                    </div>
                ) : (
                    <div className="opacity-50 cursor-not-allowed p-3 rounded-lg border border-slate-200 flex flex-col items-center text-center gap-2 bg-slate-50">
                         <div className="p-2 rounded-full bg-slate-100">
                             <Unlink className="w-4 h-4 text-slate-300" />
                         </div>
                         <span className="text-xs font-bold text-slate-400">No Detached DBs</span>
                    </div>
                )}
             </div>
             {dbMode === 'ATTACH' && (
                 <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                     <label className="text-xs font-semibold text-indigo-600 mb-1 block">Select Detached Database:</label>
                     <select 
                        value={selectedOrphanId} 
                        onChange={(e) => setSelectedOrphanId(e.target.value)}
                        className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                     >
                         <option value="" disabled>-- Choose a database --</option>
                         {orphanedDbs.map(db => (
                             <option key={db.id} value={db.id}>
                                 db_{db.subdomain.replace(/[^a-z0-9]/g, '')} (from deleted: {db.name})
                             </option>
                         ))}
                     </select>
                 </div>
             )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Source Code (ZIP)</label>
            <div 
              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-all cursor-pointer group 
                ${error 
                    ? 'border-red-300 bg-red-50' 
                    : isDragging
                        ? 'border-indigo-500 bg-indigo-50 scale-[1.02] shadow-lg'
                        : 'border-slate-300 hover:bg-slate-50'
                }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                 <div className="flex flex-col items-center text-indigo-600">
                    <FileArchive className="w-10 h-10 mb-2" />
                    <span className="font-medium text-sm">{file.name}</span>
                    <span className="text-xs text-indigo-400">{(file.size / 1024).toFixed(2)} KB - Ready to extract</span>
                    <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Valid ZIP Archive</p>
                 </div>
              ) : (
                <>
                  <Upload className={`w-8 h-8 mb-2 transition-colors ${isDragging ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
                  <p className="text-sm text-slate-600">
                      {isDragging ? <span className="text-indigo-600 font-bold">Drop file here</span> : <>Drag & drop or <span className="text-indigo-600 font-medium">browse</span></>}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Only .zip files allowed (Max 100MB)</p>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={handleFileChange}
              />
            </div>
            {error && <p className="text-sm text-red-600 font-medium mt-1">{error}</p>}
          </div>

          <div className="pt-4 flex justify-end">
            <button 
              type="submit" 
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex items-center gap-2"
            >
              Deploy Site
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
};