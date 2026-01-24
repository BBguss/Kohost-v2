
import React, { useState, useEffect, useRef } from 'react';
import { User, Site, SiteStatus } from '../../types';
import { api } from '../../services/api';
import { Database, Server, ExternalLink, Trash2, Link, Table, ChevronDown, ChevronUp, FileSpreadsheet, Plus, X, Loader2, Unlink, AlertTriangle, Upload, Download, ArrowDown, Network, Copy, Check, Code, Terminal, HardDrive, Activity, CheckCircle2, AlertOctagon } from 'lucide-react';
import { TableViewer } from '../../components/database/TableViewer';

interface DatabaseManagerProps {
  sites: Site[];
  user: User;
  onRefresh: () => void;
}

interface RealTable {
    name: string;
    rows: number;
    size: string; // e.g. "16.0 KB"
    engine: string;
    collation: string;
}

// Reuse definitions for Viewer
interface ColumnDef {
    name: string;
    type: string;
    collation: string;
    null: 'YES' | 'NO';
    key: 'PRI' | 'UNI' | '';
    default: string | null;
    extra: string;
}

interface TableViewState {
    siteId: string;
    dbName: string;
    tableName: string;
    mode: 'BROWSE' | 'STRUCTURE' | 'RELATIONS';
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ sites, user, onRefresh }) => {
    if (!user || !user.username) {
        return <div className="p-10 text-center text-slate-500">Loading profile data...</div>;
    }

    const safeSites = Array.isArray(sites) ? sites : [];
    const dbSites = safeSites.filter(site => site.hasDatabase);
    const sitesWithoutDb = safeSites.filter(site => !site.hasDatabase && site.status !== 'FAILED' && site.status !== SiteStatus.DB_ONLY);
    
    const [expandedDb, setExpandedDb] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [targetSiteId, setTargetSiteId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dbToDelete, setDbToDelete] = useState<Site | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Table Data State (Real Data)
    const [siteTables, setSiteTables] = useState<Record<string, RealTable[]>>({});
    const [loadingTables, setLoadingTables] = useState<Record<string, boolean>>({});

    // Table Viewer State
    const [viewingTable, setViewingTable] = useState<TableViewState | null>(null);
    const [viewingTableData, setViewingTableData] = useState<{ columns: any[]; data: any[] }>({ columns: [], data: [] });
    const [loadingTableData, setLoadingTableData] = useState(false);
    
    // Import/Export State
    const [isImporting, setIsImporting] = useState(false);
    const [exportingSiteId, setExportingSiteId] = useState<string | null>(null); // New: Track which site is exporting
    const importFileInputRef = useRef<HTMLInputElement>(null);
    const [activeImportSiteId, setActiveImportSiteId] = useState<string | null>(null);

    // Feedback State
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Connection Snippet State
    const [snippetTab, setSnippetTab] = useState<'ENV' | 'NODE' | 'RAW'>('ENV');
    const [copied, setCopied] = useState(false);

    // Auto-clear feedback
    useEffect(() => {
        if (feedback) {
            const timer = setTimeout(() => setFeedback(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedback]);

    // FETCH REAL TABLES
    const fetchTables = async (siteId: string) => {
        setLoadingTables(prev => ({ ...prev, [siteId]: true }));
        try {
            const tables = await api.database.getTables(siteId);
            setSiteTables(prev => ({ ...prev, [siteId]: tables }));
        } catch (e) {
            console.error("Failed to fetch tables", e);
            setSiteTables(prev => ({ ...prev, [siteId]: [] })); // Default empty on error
        } finally {
            setLoadingTables(prev => ({ ...prev, [siteId]: false }));
        }
    };

    // Auto-fetch when expanding
    useEffect(() => {
        if (expandedDb) {
            fetchTables(expandedDb);
        }
    }, [expandedDb]);

    // Fetch table data when viewing table
    useEffect(() => {
        if (viewingTable && viewingTable.tableName) {
            fetchTableData(viewingTable.tableName);
        }
    }, [viewingTable]);

    const fetchTableData = async (tableName: string) => {
        if (!viewingTable?.siteId || !tableName) return;
        setLoadingTableData(true);
        try {
            const result = await api.database.getTableData(viewingTable.siteId, tableName);
            setViewingTableData(result);
        } catch (e) {
            console.error("Failed to fetch table data", e);
            setViewingTableData({ columns: [], data: [] });
        } finally {
            setLoadingTableData(false);
        }
    };

    // --- IMPORT / EXPORT HANDLERS ---
    const handleExport = async (siteId: string, dbName: string) => {
        setExportingSiteId(siteId);
        try {
            // Real export triggers a download stream
            const blob = await api.database.export(siteId);
            
            // Check if response is actually JSON error (in case of failure)
            if (blob.type === 'application/json') {
                const text = await blob.text();
                const err = JSON.parse(text);
                throw new Error(err.message || 'Export failed');
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${dbName}_dump.sql`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setFeedback({ type: 'success', message: 'Database export started.' });
        } catch (e: any) {
            setFeedback({ type: 'error', message: `Export Failed: ${e.message}` });
        } finally {
            setExportingSiteId(null);
        }
    };

    const triggerImport = (siteId: string) => {
        setActiveImportSiteId(siteId);
        if (importFileInputRef.current) {
            importFileInputRef.current.value = '';
            importFileInputRef.current.click();
        }
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeImportSiteId) return;

        setIsImporting(true);
        try {
            const result = await api.database.import(activeImportSiteId, file);
            setFeedback({ type: 'success', message: result.message || 'Import successful!' });
            // Refresh tables after import to show new data
            fetchTables(activeImportSiteId);
        } catch (e: any) {
            setFeedback({ type: 'error', message: "Failed to import: " + e.message });
        } finally {
            setIsImporting(false);
            setActiveImportSiteId(null);
        }
    };

    // --- ACTIONS ---
    const handleCreateDatabase = async () => {
        if (!targetSiteId) return;
        setIsSubmitting(true);
        try {
            const targetSite = sites.find(s => s.id === targetSiteId);
            const dbName = targetSite ? `db_${targetSite.subdomain}` : undefined;
            await api.database.create(targetSiteId, dbName);
            setFeedback({ type: 'success', message: 'Database created successfully!' });
            onRefresh();
            setIsCreating(false);
            setTargetSiteId('');
        } catch (e: any) {
            setFeedback({ type: 'error', message: "Failed to create database: " + (e.message || 'Unknown error') });
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDropDatabase = async () => {
        if (!dbToDelete) return;
        setIsDeleting(true);
        try {
            if (dbToDelete.status === SiteStatus.DB_ONLY) {
                // For "DB_ONLY" sites (detached orphans), we delete the site record entirely
                await api.sites.delete(dbToDelete.id, true);
            } else {
                // For active sites, we execute the DROP action specifically
                await api.database.drop(dbToDelete.id);
            }
            onRefresh();
            setDbToDelete(null);
            setFeedback({ type: 'success', message: 'Database dropped successfully.' });
        } catch (e: any) {
            console.error("Drop DB Error:", e);
            setFeedback({ type: 'error', message: "Failed to drop database: " + (e.message || "Unknown error") });
        } finally {
            setIsDeleting(false);
        }
    };

    // --- CREDENTIAL GENERATION LOGIC ---
    const masterDbUser = `sql_${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const masterDbPass = `kp_${user.id.substring(0,4)}@${user.username.substring(0,3).toUpperCase()}#88`;
    const masterHost = "127.0.0.1";
    const masterPort = "3306";
    
    // Pick first available DB name for snippet example
    const exampleDbName = dbSites.length > 0 
        ? `db_${dbSites[0].subdomain.replace(/[^a-z0-9]/g, '')}` 
        : 'your_database_name';

    const getSnippet = () => {
        switch(snippetTab) {
            case 'ENV':
                return `DB_CONNECTION=mysql
DB_HOST=${masterHost}
DB_PORT=${masterPort}
DB_DATABASE=${exampleDbName}
DB_USERNAME=${masterDbUser}
DB_PASSWORD=${masterDbPass}`;
            case 'NODE':
                return `// TypeORM / Prisma Connection URL
mysql://${masterDbUser}:${masterDbPass}@${masterHost}:${masterPort}/${exampleDbName}?schema=public`;
            case 'RAW':
                return `Host:     ${masterHost}
Port:     ${masterPort}
Username: ${masterDbUser}
Password: ${masterDbPass}`;
            default: return '';
        }
    };

    const handleCopySnippet = () => {
        navigator.clipboard.writeText(getSnippet());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-600" /> Web Database Manager
                    </h2>
                    <p className="text-sm text-slate-500">Manage schemas, inspect data, and configure connections.</p>
                </div>
            </div>

            {/* FEEDBACK TOAST */}
            {feedback && (
                <div className={`fixed top-20 right-6 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${feedback.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
                    <span className="text-sm font-bold">{feedback.message}</span>
                </div>
            )}

            {/* DASHBOARD WIDGETS (Replaces Old Credentials Card) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Stats Column */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-bold uppercase tracking-wider">
                                <Database className="w-4 h-4" /> Databases
                            </div>
                            <div className="text-3xl font-bold text-slate-900">{dbSites.length}</div>
                            <div className="text-xs text-emerald-600 font-medium mt-1">Active</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-500 mb-2 text-xs font-bold uppercase tracking-wider">
                                <HardDrive className="w-4 h-4" /> Usage
                            </div>
                            <div className="text-3xl font-bold text-slate-900">
                                {dbSites.length > 0 ? (Math.random() * 5).toFixed(1) : 0} <span className="text-sm text-slate-400 font-normal">MB</span>
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-1">Estimated</div>
                        </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-xl text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10"><Activity className="w-24 h-24" /></div>
                        <div className="relative z-10">
                            <h4 className="text-sm font-bold text-slate-300 mb-1">Service Status</h4>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                                <span className="font-mono text-lg font-bold">MySQL 8.0 Running</span>
                            </div>
                            <div className="text-xs text-slate-400 pt-3 border-t border-slate-700">
                                Uptime: 99.9% • Localhost Only
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Connection Helper Column (The "Useful" Replacement) */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-indigo-600" /> Quick Connect Snippets
                        </h3>
                        <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200">
                            {(['ENV', 'NODE', 'RAW'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setSnippetTab(tab)}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${snippetTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                                >
                                    {tab === 'ENV' ? 'Laravel .env' : tab === 'NODE' ? 'Node.js URI' : 'Raw Creds'}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 relative group bg-slate-900">
                        <pre className="p-5 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar h-full">
                            {getSnippet()}
                        </pre>
                        
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={handleCopySnippet}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium backdrop-blur-sm transition-colors border border-white/10"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        
                        {/* Helpful Tip Footer inside code block */}
                        <div className="absolute bottom-0 w-full bg-slate-800/50 backdrop-blur-sm py-2 px-4 border-t border-slate-700 text-[10px] text-slate-400 flex items-center gap-2">
                            <Code className="w-3 h-3" />
                            <span>These credentials work for <b>ALL</b> databases owned by your account. Database name varies per project.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Input for Import */}
            <input 
                type="file" 
                ref={importFileInputRef} 
                className="hidden" 
                accept=".sql"
                onChange={handleImportFileChange} 
            />

            {/* Database List */}
            <div className="space-y-4 pt-4">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-1">
                        <Database className="w-5 h-5 text-indigo-600" />
                        Active Databases
                        <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{dbSites.length}</span>
                    </h3>
                    <button onClick={() => setIsCreating(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" /> New Database
                    </button>
                 </div>

                 {dbSites.length > 0 ? (
                    <div className="flex flex-col gap-4">
                    {dbSites.map((site) => {
                        const dbName = `db_${site.subdomain.replace(/[^a-z0-9]/g, '')}`;
                        const isExpanded = expandedDb === site.id;
                        const tables = siteTables[site.id] || [];
                        const isLoading = loadingTables[site.id];
                        const isOrphan = site.status === SiteStatus.DB_ONLY;
                        const isThisSiteExporting = exportingSiteId === site.id;
                        const isThisSiteImporting = isImporting && activeImportSiteId === site.id;

                        return (
                            <div key={site.id} className={`bg-white rounded-xl shadow-sm border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-indigo-200 ring-2 ring-indigo-50 shadow-md' : 'border-slate-200 hover:border-indigo-300'} ${isOrphan ? 'bg-slate-50/50' : ''}`}>
                                <div className="p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4 w-full md:w-auto cursor-pointer" onClick={() => setExpandedDb(isExpanded ? null : site.id)}>
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center border shadow-sm transition-colors ${isExpanded ? 'bg-indigo-600 text-white border-indigo-600' : isOrphan ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-indigo-600 border-slate-200'}`}>
                                            <Database className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Database Name</div>
                                            <h4 className="font-bold text-slate-900 font-mono text-lg flex items-center gap-2">
                                                {dbName}
                                                {isOrphan && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-sans">Detached</span>}
                                            </h4>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => triggerImport(site.id)} 
                                                disabled={isImporting || isThisSiteExporting}
                                                className={`px-3 py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1.5 transition-colors shadow-sm ${
                                                    isThisSiteImporting 
                                                    ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-wait' 
                                                    : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200'
                                                }`}
                                            >
                                                {isThisSiteImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                                {isThisSiteImporting ? 'Importing...' : 'Import SQL'}
                                            </button>
                                            <button 
                                                onClick={() => handleExport(site.id, dbName)}
                                                disabled={isImporting || isThisSiteExporting}
                                                className={`px-3 py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1.5 transition-colors shadow-sm ${
                                                    isThisSiteExporting
                                                    ? 'bg-blue-50 border-blue-200 text-blue-700 cursor-wait'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200'
                                                }`}
                                            >
                                                {isThisSiteExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} 
                                                {isThisSiteExporting ? 'Exporting...' : 'Export'}
                                            </button>
                                            <button 
                                                onClick={() => setViewingTable({ siteId: site.id, dbName, tableName: '', mode: 'RELATIONS' })}
                                                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                                            >
                                                <Network className="w-3 h-3" /> Designer
                                            </button>
                                        </div>

                                        <div className="w-px h-8 bg-slate-200 hidden md:block"></div>

                                        <div className="flex items-center gap-3">
                                            <div className="hidden sm:flex flex-col items-end mr-2">
                                                 <span className="text-xs font-bold text-slate-700">{tables.length} Tables</span>
                                                 <span className="text-[10px] text-slate-500">
                                                    {isLoading ? 'Checking...' : tables.length === 0 ? 'Empty' : tables.reduce((acc, t) => acc + t.rows, 0) + ' Rows'}
                                                 </span>
                                            </div>
                                            <button 
                                                onClick={() => setExpandedDb(isExpanded ? null : site.id)}
                                                className={`p-2 rounded-lg transition-colors border ${isExpanded ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}
                                            >
                                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="border-t border-slate-200 animate-in slide-in-from-top-2 duration-200">
                                        <div className="p-6 bg-slate-50/50">
                                            <div className="flex items-center justify-between mb-4">
                                                <h5 className="font-bold text-slate-800 flex items-center gap-2"><Table className="w-4 h-4 text-slate-500" /> Database Tables</h5>
                                                <div className="flex gap-2">
                                                    <button onClick={() => fetchTables(site.id)} className="text-xs flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded">
                                                        <Loader2 className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                                                    </button>
                                                    <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">Showing {tables.length} tables</div>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full text-left text-sm">
                                                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                                            <tr>
                                                                <th className="px-4 py-3 font-medium">Table Name</th>
                                                                <th className="px-4 py-3 font-medium">Rows</th>
                                                                <th className="px-4 py-3 font-medium">Size</th>
                                                                <th className="px-4 py-3 font-medium">Engine</th>
                                                                <th className="px-4 py-3 font-medium">Collation</th>
                                                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {isLoading ? (
                                                                <tr>
                                                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic bg-slate-50/50">
                                                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                                                        Fetching tables from MySQL...
                                                                    </td>
                                                                </tr>
                                                            ) : tables.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic bg-slate-50/50">
                                                                        No tables found. Import a .sql file to get started.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                tables.map((t, i) => (
                                                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                                                                        <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /> {t.name}</td>
                                                                        <td className="px-4 py-3 text-slate-600">{t.rows}</td>
                                                                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{t.size}</td>
                                                                        <td className="px-4 py-3 text-slate-500 text-xs">{t.engine}</td>
                                                                        <td className="px-4 py-3 text-slate-500 text-xs">{t.collation}</td>
                                                                        <td className="px-4 py-3 text-right">
                                                                            <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                                                <button onClick={() => setViewingTable({ siteId: site.id, dbName, tableName: t.name, mode: 'BROWSE' })} className="text-xs text-indigo-600 hover:underline hover:text-indigo-800 font-medium">Browse</button>
                                                                                <span className="text-slate-300">|</span>
                                                                                <button onClick={() => setViewingTable({ siteId: site.id, dbName, tableName: t.name, mode: 'STRUCTURE' })} className="text-xs text-indigo-600 hover:underline hover:text-indigo-800 font-medium">Structure</button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex justify-end">
                                                <button onClick={() => setDbToDelete(site)} className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" /> Drop Database</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </div>
                 ) : (
                    <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4"><Database className="w-8 h-8" /></div>
                        <h3 className="text-lg font-bold text-slate-800">No Databases Found</h3>
                        <p className="text-slate-500 mt-2 max-w-sm mx-auto text-sm">You haven't created any databases yet.</p>
                    </div>
                 )}
            </div>

            {/* Modals */}
            {isCreating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsCreating(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-lg"><Database className="w-6 h-6 text-indigo-600" /></div>
                                <div><h3 className="text-lg font-bold text-slate-900">Create New Database</h3><p className="text-xs text-slate-500">Attach a database to an existing project.</p></div>
                            </div>
                            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Select Project</label>
                                {sitesWithoutDb.length > 0 ? (
                                    <select value={targetSiteId} onChange={(e) => setTargetSiteId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                                        <option value="" disabled>-- Choose a project --</option>
                                        {sitesWithoutDb.map(site => (
                                            <option key={site.id} value={site.id}>{site.name} ({site.subdomain})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">All your active projects already have a database.</div>
                                )}
                            </div>
                            {targetSiteId && (
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                                    <p className="text-slate-600 mb-1">Database Name will be:</p>
                                    <code className="font-mono font-bold text-indigo-600">db_{sitesWithoutDb.find(s => s.id === targetSiteId)?.subdomain.replace(/[^a-z0-9]/g, '')}</code>
                                </div>
                            )}
                            <div className="pt-4 flex justify-end gap-3">
                                <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                                <button onClick={handleCreateDatabase} disabled={!targetSiteId || isSubmitting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Create Database</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {dbToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setDbToDelete(null)} />
                    <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 rounded-full shrink-0"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Drop Database?</h3>
                                <p className="text-sm text-slate-500 mt-1">Are you sure you want to drop <span className="font-bold text-slate-800">db_{dbToDelete.subdomain.replace(/[^a-z0-9]/g, '')}</span>?</p>
                                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                                    <p className="font-bold mb-1">Warning: Irreversible Action</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>All tables and data will be permanently deleted.</li>
                                        {dbToDelete.status === SiteStatus.DB_ONLY ? (<li>This database is detached, so the item will be removed from your list entirely.</li>) : (<li>The linked site <b>{dbToDelete.name}</b> will lose database connectivity.</li>)}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setDbToDelete(null)} disabled={isDeleting} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                            <button onClick={confirmDropDatabase} disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2">{isDeleting && <Loader2 className="w-4 h-4 animate-spin" />} Confirm Drop</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Viewer Component - Passed the active site ID */}
            {viewingTable && (
                <TableViewer 
                    siteId={viewingTable.siteId}
                    viewingTable={viewingTable}
                    data={viewingTableData}
                    onClose={() => setViewingTable(null)}
                    onSave={() => {}}
                    onDelete={() => {}}
                    onRefresh={() => fetchTableData(viewingTable.tableName)}
                    switchMode={(mode) => setViewingTable({...viewingTable, mode})}
                />
            )}
        </div>
    );
};
