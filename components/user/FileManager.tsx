import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../Shared';
import { Site, FileNode } from '../../types';
import { HardDrive, Upload, Folder, Trash2, Edit2, ChevronDown, Download, CornerUpLeft, Home, Plus, Loader2, X, Check, AlertTriangle, Save, FileCode } from 'lucide-react';
import { useFileSystem } from '../../hooks/useFileSystem';
import { FileRow } from '../files/FileRow';

interface FileManagerProps {
    sites: Site[];
    fileSystem: any; 
    onRename: any;
    onDelete: any;
    onCreateFolder: any;
    onUpload: any;
}

export const FileManager: React.FC<FileManagerProps> = ({ sites }) => {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '');
  const [currentPath, setCurrentPath] = useState('/');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Editor State
  const [editor, setEditor] = useState({ 
      isOpen: false, 
      fileName: '', 
      content: '', 
      isLoading: false,
      isSaving: false
  });

  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0];
  const { currentFiles, loadingFiles, fetchFiles, uploadFile, deleteFile, renameFile, createFolder, getFileContent, saveFileContent } = useFileSystem(sites);

  useEffect(() => {
      if (selectedSite) {
          fetchFiles(selectedSite.id, currentPath);
          setRenamingId(null);
          setDeleteTarget(null);
          setIsCreatingFolder(false);
      }
  }, [selectedSiteId, currentPath, selectedSite]);

  // Sort files: Folders first, then alphabetically
  const sortedFiles = React.useMemo(() => {
      return [...currentFiles].sort((a, b) => {
          if (a.type === b.type) {
              return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
          }
          return a.type === 'folder' ? -1 : 1;
      });
  }, [currentFiles]);

  const handleNavigate = (folderName: string) => {
      if (renamingId || isCreatingFolder) return;
      const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
      setCurrentPath(newPath);
  };

  const handleNavigateUp = () => {
      if (currentPath === '/') return;
      const parts = currentPath.split('/');
      parts.pop(); 
      const newPath = parts.join('/') || '/'; 
      setCurrentPath(newPath);
  };

  const handleBreadcrumbClick = (index: number) => {
      const parts = currentPath.split('/').filter(Boolean);
      const newPath = '/' + parts.slice(0, index + 1).join('/');
      setCurrentPath(newPath);
  };

  const submitCreateFolder = async () => {
      if (!newFolderName.trim() || !selectedSite) return;
      await createFolder(selectedSite.id, currentPath, newFolderName);
      setIsCreatingFolder(false);
      setNewFolderName('');
  };

  const handleUploadClick = () => {
      if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && selectedSite) {
          await uploadFile(selectedSite.id, currentPath, file);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleRenameClick = (e: React.MouseEvent, node: FileNode) => {
      e.stopPropagation();
      e.preventDefault();
      setRenamingId(node.id);
      setRenameValue(node.name);
      setIsCreatingFolder(false);
  };

  const submitRename = async () => {
      if (!selectedSite || !renamingId) return;
      const file = currentFiles.find(f => f.id === renamingId);
      if (file && renameValue.trim() && renameValue !== file.name) {
          await renameFile(selectedSite.id, currentPath, file.name, renameValue);
      }
      setRenamingId(null);
      setRenameValue('');
  };

  const handleDeleteClick = (e: React.MouseEvent, node: FileNode) => {
      e.stopPropagation();
      e.preventDefault();
      setDeleteTarget(node);
  };

  const confirmDelete = async () => {
      if (selectedSite && deleteTarget) {
          await deleteFile(selectedSite.id, currentPath, deleteTarget.name);
          setDeleteTarget(null);
      }
  };

  // --- EDITOR HANDLERS ---
  const handleEditClick = async (e: React.MouseEvent, node: FileNode) => {
      e.stopPropagation();
      if (!selectedSite) return;

      setEditor({ isOpen: true, fileName: node.name, content: '', isLoading: true, isSaving: false });
      
      try {
          const content = await getFileContent(selectedSite.id, currentPath, node.name);
          setEditor(prev => ({ ...prev, content, isLoading: false }));
      } catch (err) {
          setEditor(prev => ({ ...prev, content: 'Error loading file content.', isLoading: false }));
      }
  };

  const handleSaveFile = async () => {
      if (!selectedSite) return;
      
      setEditor(prev => ({ ...prev, isSaving: true }));
      try {
          await saveFileContent(selectedSite.id, currentPath, editor.fileName, editor.content);
          setEditor(prev => ({ ...prev, isOpen: false, isSaving: false }));
      } catch (err) {
          alert("Failed to save file.");
          setEditor(prev => ({ ...prev, isSaving: false }));
      }
  };

  const SiteSelector = () => (
    <div className="relative group">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">Active Project:</label>
        <div className="relative">
          <select 
            value={selectedSiteId}
            onChange={(e) => { setSelectedSiteId(e.target.value); setCurrentPath('/'); }}
            className="appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-8 py-1.5 cursor-pointer outline-none"
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name} ({site.framework})</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><ChevronDown className="h-4 w-4" /></div>
        </div>
      </div>
    </div>
  );

  if (!selectedSite) {
      return (
          <Card title="File Manager"><div className="text-center py-12 text-slate-500">No sites available. Please deploy a site first.</div></Card>
      )
  }

  const showList = sortedFiles.length > 0 || isCreatingFolder;

  return (
    <Card title="File Manager" action={<SiteSelector />} className="h-[650px]">
      <div className="flex flex-col h-[540px]">
          <div className="mb-4 pb-4 border-b border-slate-100 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={() => { setIsCreatingFolder(true); setNewFolderName('New Folder'); }} disabled={isCreatingFolder} className={`px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors flex items-center gap-1 ${isCreatingFolder ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Plus className="w-4 h-4" /> New Folder
                    </button>
                    <button onClick={handleUploadClick} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-2 transition-colors shadow-sm">
                        <Upload className="w-3 h-3" /> Upload
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                </div>
                {selectedSite && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full font-mono">
                    <HardDrive className="w-3 h-3" /><span>/ {selectedSite.name} {currentPath === '/' ? '' : currentPath}</span>
                </div>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <button onClick={handleNavigateUp} disabled={currentPath === '/'} className="p-1 text-slate-500 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Go Up"><CornerUpLeft className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-slate-300 mx-1"></div>
                  <button onClick={() => setCurrentPath('/')} className={`flex items-center p-1 rounded hover:bg-slate-200 ${currentPath === '/' ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}><Home className="w-4 h-4" /></button>
                  {currentPath !== '/' && currentPath.split('/').filter(Boolean).map((part, index, arr) => (
                      <React.Fragment key={index}>
                          <span className="text-slate-400">/</span>
                          <button onClick={() => handleBreadcrumbClick(index)} className={`px-1 rounded hover:bg-slate-200 hover:text-indigo-600 ${index === arr.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{part}</button>
                      </React.Fragment>
                  ))}
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg border border-slate-200 relative min-h-0">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-slate-500 border-b border-slate-200 bg-slate-100/50 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10">
              <div className="col-span-6">Name</div>
              <div className="col-span-3">Size</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>
            
            {loadingFiles && <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}
            
            {showList ? (
              <div className="divide-y divide-slate-100">
                {isCreatingFolder && (
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-indigo-50 items-center text-sm h-[53px] animate-in slide-in-from-top-2 fade-in">
                        <div className="col-span-6 flex items-center gap-3">
                            <Folder className="w-5 h-5 text-blue-400 fill-blue-50 shrink-0" />
                            <div className="flex items-center gap-1 w-full">
                                <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') submitCreateFolder(); if(e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); } }} autoFocus className="w-full px-2 py-1 text-sm border border-indigo-300 rounded shadow-sm focus:ring-2 focus:ring-indigo-200 outline-none bg-white" placeholder="Folder Name" />
                                <button onClick={submitCreateFolder} className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }} className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                        <div className="col-span-3 text-slate-400 font-mono text-xs">-</div>
                        <div className="col-span-3"></div>
                    </div>
                )}

                {sortedFiles.map((file) => (
                    <FileRow 
                        key={file.id}
                        file={file}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        onRenameClick={handleRenameClick}
                        onDeleteClick={handleDeleteClick}
                        onEditContentClick={handleEditClick}
                        onDownloadClick={(e, f) => alert("Download feature requires a static file serving endpoint setup in Express.")}
                        onNavigate={handleNavigate}
                        submitRename={submitRename}
                        cancelRename={() => { setRenamingId(null); setRenameValue(''); }}
                    />
                ))}
              </div>
            ) : (
              !loadingFiles && <div className="flex flex-col items-center justify-center h-full text-slate-400"><Folder className="w-12 h-12 mb-2 opacity-20" /><p>Folder is empty.</p></div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500 shrink-0">
            <div>{sortedFiles.length} items</div>
            <div>Total Used: {selectedSite.storageUsed} MB</div>
          </div>

          {/* Delete Confirmation Modal */}
          {deleteTarget && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setDeleteTarget(null)} />
                <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-red-100 rounded-full shrink-0"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Delete Item?</h3>
                            <p className="text-sm text-slate-500 mt-1">Are you sure you want to delete <span className="font-bold text-slate-800">{deleteTarget.name}</span>?</p>
                            {deleteTarget.type === 'folder' && <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-100">Warning: All contents inside this folder will be permanently deleted.</p>}
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors">Delete</button>
                    </div>
                </div>
            </div>
          )}

          {/* CODE EDITOR MODAL */}
          {editor.isOpen && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onClick={() => setEditor(prev => ({...prev, isOpen: false}))} />
                  <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[85vh]">
                      
                      {/* Editor Header */}
                      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                          <div>
                              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                  <FileCode className="w-5 h-5 text-indigo-600" />
                                  Edit File
                              </h3>
                              <p className="text-xs text-slate-500 font-mono mt-1">{editor.fileName}</p>
                          </div>
                          <button onClick={() => setEditor(prev => ({...prev, isOpen: false}))} disabled={editor.isSaving} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                      </div>

                      {/* Editor Content */}
                      <div className="flex-1 min-h-0 bg-slate-900 relative">
                          {editor.isLoading ? (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                  <Loader2 className="w-8 h-8 animate-spin" />
                              </div>
                          ) : (
                              <textarea 
                                  value={editor.content}
                                  onChange={(e) => setEditor(prev => ({ ...prev, content: e.target.value }))}
                                  className="w-full h-full bg-slate-900 text-emerald-400 font-mono text-sm p-4 focus:outline-none resize-none custom-scrollbar"
                                  spellCheck={false}
                              />
                          )}
                      </div>

                      {/* Editor Footer */}
                      <div className="pt-4 pb-4 px-6 flex justify-end gap-3 shrink-0 bg-white border-t border-slate-100">
                          <button 
                              onClick={() => setEditor(prev => ({...prev, isOpen: false}))} 
                              disabled={editor.isSaving}
                              className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleSaveFile} 
                              disabled={editor.isSaving || editor.isLoading}
                              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                              {editor.isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Save Changes
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </Card>
  );
};