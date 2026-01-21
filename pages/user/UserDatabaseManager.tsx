/**
 * ============================================
 * USER DATABASE MANAGER
 * ============================================
 * 
 * Database management dengan user isolation.
 * Setiap user memiliki MySQL credentials sendiri.
 * 
 * Features:
 * - Create/Delete databases
 * - SQL Editor
 * - Import/Export SQL
 * - Terminal credential sync
 */

import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { 
  Database, Plus, Trash2, Terminal, Copy, Eye, EyeOff, 
  Download, Upload, Play, Table, Key, RefreshCw, X,
  ChevronDown, ChevronUp, AlertTriangle, Check, Code,
  FileText, Clock, Star, Loader2
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface DatabaseCredentials {
  mysqlUser: string;
  host: string;
  dockerHost: string;
  port: number;
  password?: string;
  isNew?: boolean;
}

interface UserDatabase {
  id: number;
  name: string;
  fullName: string;
  host: string;
  port: number;
  sizeMb: number;
  tablesCount: number;
  siteName: string | null;
  createdAt: string;
}

interface TableInfo {
  name: string;
  rows: number;
  size_kb: number;
  engine: string;
  created_at: string;
}

interface QueryResult {
  success: boolean;
  statementType: string;
  executionTimeMs: number;
  results: any[] | null;
  affectedRows?: number;
  insertId?: number;
  warnings?: string[];
  requiresConfirmation?: boolean;
}

interface QueryHistory {
  id: number;
  query_text: string;
  query_type: string;
  execution_time_ms: number;
  rows_returned: number;
  is_favorite: boolean;
  executed_at: string;
}

interface UserDatabaseManagerProps {
  user: User;
}

// ============================================
// API FUNCTIONS
// ============================================

const API_BASE = '/api/user-db';

const userDbApi = {
  getCredentials: async (): Promise<{ credentials: DatabaseCredentials }> => {
    const res = await fetch(`${API_BASE}/credentials`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to get credentials');
    return res.json();
  },
  
  listDatabases: async (): Promise<{ databases: UserDatabase[], limits: { current: number, max: number }, connection: DatabaseCredentials }> => {
    const res = await fetch(`${API_BASE}/databases`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to list databases');
    return res.json();
  },
  
  createDatabase: async (name: string, siteId?: string, customDbName?: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, siteId, customDbName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create database');
    }
    return res.json();
  },
  
  dropDatabase: async (dbName: string, confirm: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/databases/${dbName}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirm }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete database');
    }
    return res.json();
  },
  
  getDatabaseInfo: async (dbName: string): Promise<{ database: any, tables: TableInfo[] }> => {
    const res = await fetch(`${API_BASE}/databases/${dbName}/info`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to get database info');
    return res.json();
  },
  
  executeQuery: async (dbName: string, query: string, confirmed = false): Promise<QueryResult> => {
    const res = await fetch(`${API_BASE}/databases/${dbName}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query, confirmed }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mysqlError || data.error || 'Query failed');
    return data;
  },
  
  getQueryHistory: async (dbName: string): Promise<{ history: QueryHistory[] }> => {
    const res = await fetch(`${API_BASE}/databases/${dbName}/history`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to get history');
    return res.json();
  },
  
  exportDatabase: async (dbName: string, includeData = true): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/databases/${dbName}/export?includeData=${includeData}`, { 
      credentials: 'include' 
    });
    if (!res.ok) throw new Error('Failed to export');
    return res.blob();
  },
  
  importDatabase: async (dbName: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/databases/${dbName}/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    return data;
  },
  
  getEnvContent: async (): Promise<{ envContent: string }> => {
    const res = await fetch(`${API_BASE}/env-content`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to get env content');
    return res.json();
  },
  
  // Discovery & Sync
  discoverDatabases: async (): Promise<{ discovered: any[], discoveredCount: number, message: string }> => {
    const res = await fetch(`${API_BASE}/discover`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to discover databases');
    return res.json();
  },
  
  importExternalDatabase: async (databaseName: string, displayName?: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/import-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ databaseName, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import database');
    return data;
  },
  
  refreshStats: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/refresh-stats`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to refresh stats');
    return res.json();
  },
};

// ============================================
// MAIN COMPONENT
// ============================================

export const UserDatabaseManager: React.FC<UserDatabaseManagerProps> = ({ user }) => {
  // State
  const [databases, setDatabases] = useState<UserDatabase[]>([]);
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);
  const [limits, setLimits] = useState({ current: 0, max: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  
  // Create Database Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [customDbName, setCustomDbName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Delete Confirmation
  const [dbToDelete, setDbToDelete] = useState<UserDatabase | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // SQL Editor
  const [showSqlEditor, setShowSqlEditor] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM your_table LIMIT 10;');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
  
  // Import/Export
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  
  // Env Content Modal
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envContent, setEnvContent] = useState('');
  
  // Import External Database Modal
  const [showImportExternalModal, setShowImportExternalModal] = useState(false);
  const [externalDbName, setExternalDbName] = useState('');
  const [externalDisplayName, setExternalDisplayName] = useState('');
  const [importingExternal, setImportingExternal] = useState(false);
  
  // Discovering databases
  const [discovering, setDiscovering] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================
  
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userDbApi.listDatabases();
      setDatabases(data.databases);
      setCredentials(data.connection);
      setLimits(data.limits);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchTables = async (dbName: string) => {
    setLoadingTables(true);
    try {
      const data = await userDbApi.getDatabaseInfo(dbName);
      setTables(data.tables);
    } catch (e) {
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };
  
  useEffect(() => {
    if (expandedDb) {
      fetchTables(expandedDb);
    }
  }, [expandedDb]);

  // ============================================
  // ACTIONS
  // ============================================
  
  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) return;
    
    setCreating(true);
    try {
      // Use customDbName if provided, otherwise use newDbName for both
      const dbNameToUse = customDbName.trim() || undefined;
      await userDbApi.createDatabase(newDbName.trim(), undefined, dbNameToUse);
      setShowCreateModal(false);
      setNewDbName('');
      setCustomDbName('');
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };
  
  const handleDeleteDatabase = async () => {
    if (!dbToDelete || deleteConfirm !== dbToDelete.fullName) return;
    
    setDeleting(true);
    try {
      await userDbApi.dropDatabase(dbToDelete.fullName, deleteConfirm);
      setDbToDelete(null);
      setDeleteConfirm('');
      if (selectedDb === dbToDelete.fullName) {
        setSelectedDb(null);
      }
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };
  
  const handleExecuteQuery = async () => {
    if (!selectedDb || !sqlQuery.trim()) return;
    
    setExecuting(true);
    setQueryError(null);
    setQueryResult(null);
    
    try {
      const result = await userDbApi.executeQuery(selectedDb, sqlQuery);
      
      if (result.requiresConfirmation) {
        const confirmMsg = result.warnings?.join('\n') || 'This query requires confirmation.';
        if (confirm(confirmMsg + '\n\nProceed?')) {
          const confirmedResult = await userDbApi.executeQuery(selectedDb, sqlQuery, true);
          setQueryResult(confirmedResult);
        }
      } else {
        setQueryResult(result);
      }
    } catch (e: any) {
      setQueryError(e.message);
    } finally {
      setExecuting(false);
    }
  };
  
  const handleExport = async (dbName: string) => {
    setExporting(true);
    try {
      const blob = await userDbApi.exportDatabase(dbName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dbName}_${new Date().toISOString().slice(0,10)}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  };
  
  const handleImport = async (dbName: string, file: File) => {
    setImporting(true);
    try {
      const result = await userDbApi.importDatabase(dbName, file);
      alert(`Import complete: ${result.executed} statements executed, ${result.failed} failed.`);
      if (expandedDb === dbName) {
        await fetchTables(dbName);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setImporting(false);
    }
  };
  
  const handleShowEnv = async () => {
    try {
      const data = await userDbApi.getEnvContent();
      setEnvContent(data.envContent);
      setShowEnvModal(true);
    } catch (e: any) {
      alert(e.message);
    }
  };
  
  const handleDiscoverDatabases = async () => {
    setDiscovering(true);
    try {
      const result = await userDbApi.discoverDatabases();
      if (result.discoveredCount > 0) {
        alert(`✅ ${result.message}\n\nDiscovered: ${result.discovered.map((d: any) => d.display_name).join(', ')}`);
        await fetchData();
      } else {
        alert(result.message);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setDiscovering(false);
    }
  };
  
  const handleImportExternal = async () => {
    if (!externalDbName.trim()) return;
    
    setImportingExternal(true);
    try {
      const result = await userDbApi.importExternalDatabase(
        externalDbName.trim(), 
        externalDisplayName.trim() || undefined
      );
      alert(`✅ ${result.message}`);
      setShowImportExternalModal(false);
      setExternalDbName('');
      setExternalDisplayName('');
      await fetchData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setImportingExternal(false);
    }
  };
  
  const handleRefreshStats = async () => {
    try {
      await userDbApi.refreshStats();
      await fetchData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ============================================
  // RENDER
  // ============================================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-600">Loading databases...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Database className="w-7 h-7 text-blue-500" />
            Database Manager
          </h1>
          <p className="text-slate-500 mt-1">
            {limits.current} / {limits.max} databases used
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleDiscoverDatabases}
            disabled={discovering}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
            title="Sync databases created via terminal/migrate"
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync from Terminal
          </button>
          
          <button
            onClick={() => setShowImportExternalModal(true)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center gap-2 transition"
            title="Import existing database (e.g., created with root)"
          >
            <Upload className="w-4 h-4" />
            Import Existing DB
          </button>
          
          <button
            onClick={handleShowEnv}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-2 transition dark:bg-slate-700 dark:text-slate-300"
          >
            <Terminal className="w-4 h-4" />
            Terminal .env
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={limits.current >= limits.max}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Create Database
          </button>
        </div>
      </div>
      
      {/* Credentials Card */}
      {credentials && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5" />
            <h2 className="font-semibold text-lg">MySQL Credentials</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-white/70 text-sm">Host (Local)</p>
              <div className="flex items-center gap-2">
                <code className="font-mono">{credentials.host}</code>
                <button onClick={() => copyToClipboard(credentials.host)} className="opacity-70 hover:opacity-100">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div>
              <p className="text-white/70 text-sm">Host (Docker)</p>
              <div className="flex items-center gap-2">
                <code className="font-mono">{credentials.dockerHost}</code>
                <button onClick={() => copyToClipboard(credentials.dockerHost)} className="opacity-70 hover:opacity-100">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div>
              <p className="text-white/70 text-sm">Username</p>
              <div className="flex items-center gap-2">
                <code className="font-mono">{credentials.mysqlUser}</code>
                <button onClick={() => copyToClipboard(credentials.mysqlUser)} className="opacity-70 hover:opacity-100">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div>
              <p className="text-white/70 text-sm">Port</p>
              <code className="font-mono">{credentials.port}</code>
            </div>
          </div>
          
          <p className="mt-4 text-white/80 text-sm">
            💡 Use <code className="bg-white/20 px-1 rounded">host.docker.internal</code> in your Laravel .env for <code className="bg-white/20 px-1 rounded">DB_HOST</code>
          </p>
        </div>
      )}
      
      {/* Database List */}
      <div className="space-y-4">
        {databases.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No databases yet</p>
            <p className="text-slate-400">Create your first database to get started</p>
          </div>
        ) : (
          databases.map(db => (
            <div key={db.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Database Header */}
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                onClick={() => setExpandedDb(expandedDb === db.fullName ? null : db.fullName)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Database className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">{db.name}</h3>
                    <p className="text-sm text-slate-500 font-mono">{db.fullName}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500">
                    {db.tablesCount} tables • {db.sizeMb} MB
                  </span>
                  
                  {expandedDb === db.fullName ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>
              
              {/* Expanded Content */}
              {expandedDb === db.fullName && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  {/* Actions Bar */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-700/30 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDb(db.fullName);
                        setShowSqlEditor(true);
                      }}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg flex items-center gap-1.5"
                    >
                      <Code className="w-4 h-4" />
                      SQL Editor
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(db.fullName);
                      }}
                      disabled={exporting}
                      className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                    
                    <label className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      Import
                      <input
                        type="file"
                        accept=".sql"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImport(db.fullName, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchTables(db.fullName);
                      }}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm rounded-lg flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </button>
                    
                    <div className="flex-1" />
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDbToDelete(db);
                      }}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                  
                  {/* Tables List */}
                  <div className="p-4">
                    {loadingTables ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      </div>
                    ) : tables.length === 0 ? (
                      <p className="text-center text-slate-500 py-8">No tables in this database</p>
                    ) : (
                      <div className="space-y-2">
                        {tables.map(table => (
                          <div
                            key={table.name}
                            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <div className="flex items-center gap-3">
                              <Table className="w-4 h-4 text-slate-400" />
                              <span className="font-mono text-sm">{table.name}</span>
                            </div>
                            <div className="text-sm text-slate-500">
                              {table.rows} rows • {table.size_kb} KB
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Database Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Create Database</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="my_project"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg dark:bg-slate-700 dark:border-slate-600"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Database Name (MySQL)
              </label>
              <input
                type="text"
                value={customDbName}
                onChange={(e) => setCustomDbName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder={`db_${newDbName || 'projectname'}`}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg dark:bg-slate-700 dark:border-slate-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave empty for auto: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">db_{newDbName || 'name'}</code>
              </p>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Tip:</strong> Use the same database name as your project's <code>.env</code> file 
                (e.g., <code>db_laravel</code>, <code>donasi1</code>)
              </p>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewDbName('');
                  setCustomDbName('');
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDatabase}
                disabled={creating || !newDbName.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {dbToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-bold">Delete Database</h2>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              This will permanently delete the database <strong>{dbToDelete.name}</strong> and all its data.
              This action cannot be undone.
            </p>
            
            <p className="text-sm text-slate-500 mb-2">
              Type <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{dbToDelete.fullName}</code> to confirm:
            </p>
            
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg mb-4 dark:bg-slate-700 dark:border-slate-600"
              placeholder="Type database name to confirm"
            />
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setDbToDelete(null);
                  setDeleteConfirm('');
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDatabase}
                disabled={deleting || deleteConfirm !== dbToDelete.fullName}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Editor Modal */}
      {showSqlEditor && selectedDb && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-500" />
                SQL Editor - {selectedDb}
              </h2>
              <button onClick={() => setShowSqlEditor(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            
            {/* Editor */}
            <div className="p-4 flex-1 overflow-auto">
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                className="w-full h-40 font-mono text-sm p-3 border border-slate-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 resize-none"
                placeholder="Enter your SQL query..."
              />
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleExecuteQuery}
                  disabled={executing}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Execute
                </button>
              </div>
              
              {/* Error */}
              {queryError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {queryError}
                </div>
              )}
              
              {/* Results */}
              {queryResult && (
                <div className="mt-4">
                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {queryResult.executionTimeMs}ms
                    </span>
                    {queryResult.affectedRows !== undefined && (
                      <span>{queryResult.affectedRows} rows affected</span>
                    )}
                    {queryResult.results && (
                      <span>{queryResult.results.length} rows returned</span>
                    )}
                  </div>
                  
                  {queryResult.results && queryResult.results.length > 0 && (
                    <div className="overflow-auto max-h-80 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                          <tr>
                            {Object.keys(queryResult.results[0]).map(col => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 border-b">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.results.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                                  {val === null ? <span className="text-slate-400 italic">NULL</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Env Content Modal */}
      {showEnvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-green-500" />
                Database .env for Terminal
              </h2>
              <button onClick={() => setShowEnvModal(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            
            <div className="p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Copy this content to your Laravel project's <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">.env</code> file:
              </p>
              
              <div className="relative">
                <pre className="bg-slate-900 text-green-400 p-4 rounded-lg text-sm overflow-auto max-h-80 font-mono">
                  {envContent}
                </pre>
                <button
                  onClick={() => {
                    copyToClipboard(envContent);
                    alert('Copied!');
                  }}
                  className="absolute top-2 right-2 p-2 bg-slate-700 hover:bg-slate-600 rounded"
                >
                  <Copy className="w-4 h-4 text-white" />
                </button>
              </div>
              
              <p className="text-sm text-slate-500 mt-3">
                💡 This file is automatically synced to <code>/workspace/.kohost/database.env</code> in your terminal container.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Import External Database Modal */}
      {showImportExternalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-orange-500" />
                Import Existing Database
              </h2>
              <button onClick={() => setShowImportExternalModal(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  <strong>Info:</strong> Import an existing database (e.g., "donasi1" created with root access) 
                  to manage it from this panel. Your user credentials will be granted access to it.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Database Name (exact MySQL name)
                </label>
                <input
                  type="text"
                  value={externalDbName}
                  onChange={(e) => setExternalDbName(e.target.value)}
                  placeholder="e.g., donasi1"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  value={externalDisplayName}
                  onChange={(e) => setExternalDisplayName(e.target.value)}
                  placeholder="e.g., Laravel Donasi"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowImportExternalModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportExternal}
                  disabled={!externalDbName.trim() || importingExternal}
                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importingExternal ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Import Database</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDatabaseManager;
