import React from 'react';
import { Folder, File as FileIcon, Download, Edit2, Trash2, Check, X, FileCode } from 'lucide-react';
import { FileNode } from '../../types';

interface FileRowProps {
    file: FileNode;
    renamingId: string | null;
    renameValue: string;
    onRenameClick: (e: React.MouseEvent, node: FileNode) => void;
    onDeleteClick: (e: React.MouseEvent, node: FileNode) => void;
    onDownloadClick: (e: React.MouseEvent, node: FileNode) => void;
    onEditContentClick?: (e: React.MouseEvent, node: FileNode) => void;
    onNavigate: (folderName: string) => void;
    setRenameValue: (val: string) => void;
    submitRename: () => void;
    cancelRename: () => void;
}

export const FileRow: React.FC<FileRowProps> = ({ 
    file, renamingId, renameValue, onRenameClick, onDeleteClick, onDownloadClick, onEditContentClick, onNavigate, setRenameValue, submitRename, cancelRename 
}) => {
    return (
        <div 
            className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-white items-center text-sm group transition-all cursor-pointer hover:shadow-sm h-[53px] select-none"
            onClick={() => file.type === 'folder' && onNavigate(file.name)}
        >
            <div className="col-span-6 flex items-center gap-3 text-slate-700 group-hover:text-indigo-700 transition-colors">
                {file.type === 'folder' ? 
                    <Folder className="w-5 h-5 text-blue-400 fill-blue-50 shrink-0" /> : 
                    <FileIcon className={`w-5 h-5 shrink-0 ${file.name.endsWith('.zip') ? 'text-orange-500' : 'text-slate-400'}`} />
                }
                
                {renamingId === file.id ? (
                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="text" 
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if(e.key === 'Enter') submitRename(); if(e.key === 'Escape') cancelRename(); }}
                            autoFocus
                            className="w-full px-2 py-1 text-sm border border-indigo-300 rounded shadow-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                        />
                        <button onClick={(e) => { e.stopPropagation(); submitRename(); }} className="p-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100"><Check className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); cancelRename(); }} className="p-1 bg-red-50 text-red-500 rounded hover:bg-red-100"><X className="w-3 h-3" /></button>
                    </div>
                ) : (
                    <span className="font-medium truncate">{file.name}</span>
                )}
            </div>
            
            <div className="col-span-3 text-slate-500 font-mono text-xs">{file.size}</div>
            
            <div className="col-span-3 flex justify-end gap-2">
                {!renamingId && (
                    <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex gap-2">
                        {file.type === 'file' && onEditContentClick && (
                            <button onClick={(e) => onEditContentClick(e, file)} className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded transition-colors" title="Edit Content"><FileCode className="w-3.5 h-3.5" /></button>
                        )}
                        {file.type === 'file' && (
                            <button onClick={(e) => onDownloadClick(e, file)} className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded transition-colors" title="Download"><Download className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={(e) => onRenameClick(e, file)} className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded transition-colors" title="Rename"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => onDeleteClick(e, file)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                )}
            </div>
        </div>
    );
};