
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Table, List, Settings, Search, RefreshCw, Plus, Trash2, Edit2, Key, X, Save, Network, Link, ArrowRight, LayoutTemplate, MoreHorizontal, ZoomIn, ZoomOut, Move, Maximize, Fingerprint, Type, Loader2 } from 'lucide-react';
import { Database as DatabaseIcon } from 'lucide-react';
import { api } from '../../services/api';

interface ColumnDef {
    name: string;
    type: string;
    collation: string;
    null: 'YES' | 'NO';
    key: 'PRI' | 'UNI' | 'MUL' | '';
    default: string | null;
    extra: string;
}

interface TableViewState {
    siteId?: string; // Made optional to be backward compatible if needed, but primarily used
    dbName: string;
    tableName: string;
    mode: 'BROWSE' | 'STRUCTURE' | 'RELATIONS';
}

interface TableViewerProps {
    siteId: string | null;
    viewingTable: TableViewState;
    data: { columns: ColumnDef[]; data: any[] };
    onClose: () => void;
    onSave: (formData: any, targetIndex: number | null) => void;
    onDelete: (ids: (number | string)[]) => void;
    onRefresh: () => void;
    switchMode: (mode: 'BROWSE' | 'STRUCTURE' | 'RELATIONS') => void;
}

// Extended Node structure for visualizer
interface DiagramNode {
    id: string;
    x: number;
    y: number;
    w: number; // width
    h: number; // height
    type: 'main' | 'related';
    columns: Partial<ColumnDef>[];
}

export const TableViewer: React.FC<TableViewerProps> = ({ siteId, viewingTable, data, onClose, onSave, onDelete, onRefresh, switchMode }) => {
    const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);
    const [isEditingItem, setIsEditingItem] = useState(false);
    const [editTargetIndex, setEditTargetIndex] = useState<number | null>(null);
    const [formData, setFormData] = useState<any>({});

    // --- CANVAS STATE ---
    const containerRef = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<DiagramNode[]>([]);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [fullSchema, setFullSchema] = useState<any[]>([]);

    // Calculate node height based on columns
    const calculateNodeHeight = (columnCount: number) => {
        const HEADER_HEIGHT = 40;
        const ROW_HEIGHT = 28;
        const FOOTER_HEIGHT = 10;
        const MAX_VISIBLE_ROWS = 8;
        const visibleRows = Math.min(columnCount, MAX_VISIBLE_ROWS);
        return HEADER_HEIGHT + (visibleRows * ROW_HEIGHT) + FOOTER_HEIGHT + (columnCount > MAX_VISIBLE_ROWS ? 20 : 0);
    };

    const NODE_WIDTH = 240;
    const GRID_GAP = 50;

    // Fetch Full Schema when switching to Relations mode
    useEffect(() => {
        if (viewingTable.mode === 'RELATIONS' && siteId) {
            const loadSchema = async () => {
                setLoadingSchema(true);
                try {
                    const schema = await api.database.getSchema(siteId);
                    setFullSchema(schema);
                } catch (e) {
                    console.error("Failed to load schema", e);
                } finally {
                    setLoadingSchema(false);
                }
            };
            loadSchema();
        }
    }, [viewingTable.mode, siteId]);

    // Initialize Layout when schema is loaded
    useEffect(() => {
        if (viewingTable.mode === 'RELATIONS' && containerRef.current && fullSchema.length > 0) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            const centerX = width / 2;
            const centerY = height / 2;

            const newNodes: DiagramNode[] = [];

            // Grid Layout Logic
            // Aim for a rough square aspect ratio for the grid
            const cols = Math.ceil(Math.sqrt(fullSchema.length));
            const startX = centerX - ((cols * (NODE_WIDTH + GRID_GAP)) / 2) + NODE_WIDTH / 2;
            const startY = centerY - ((cols * (200 + GRID_GAP)) / 2) + 100; // rough height estimate

            fullSchema.forEach((tableObj, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;

                const x = startX + col * (NODE_WIDTH + GRID_GAP);
                const y = startY + row * (300); // Fixed row height spacing for simplicity

                newNodes.push({
                    id: tableObj.tableName,
                    x: x,
                    y: y,
                    w: NODE_WIDTH,
                    h: calculateNodeHeight(tableObj.columns.length),
                    type: tableObj.tableName === viewingTable.tableName ? 'main' : 'related', // Mark current active table
                    columns: tableObj.columns
                });
            });

            setNodes(newNodes);
            setPan({ x: 0, y: 0 }); // Reset pan to center
            setScale(0.8); // Zoom out slightly to see more
        }
    }, [fullSchema, viewingTable.tableName, viewingTable.mode]);

    const toggleSelection = (id: number | string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = (allIds: (number | string)[]) => {
        setSelectedIds(selectedIds.length === allIds.length ? [] : allIds);
    };

    const openEditor = (item: any = null, index: number | null = null) => {
        if (item) {
            setFormData({ ...item });
            setEditTargetIndex(index);
        } else {
            setFormData({});
            setEditTargetIndex(null);
        }
        setIsEditingItem(true);
    };

    const handleSaveInternal = () => {
        onSave(formData, editTargetIndex);
        setIsEditingItem(false);
        setEditTargetIndex(null);
        setFormData({});
    };

    // --- CANVAS INTERACTION HANDLERS ---

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const newScale = Math.min(Math.max(0.5, scale - e.deltaY * zoomSensitivity), 2.5);
            setScale(newScale);
        } else {
            setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            setIsDraggingCanvas(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            setPanStart({ ...pan });
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        setDraggingNodeId(nodeId);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDraggingCanvas) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setPan({ x: panStart.x + dx, y: panStart.y + dy });
        } else if (draggingNodeId) {
            const dx = (e.clientX - dragStart.x) / scale;
            const dy = (e.clientY - dragStart.y) / scale;

            setNodes(prev => prev.map(n => {
                if (n.id === draggingNodeId) {
                    return { ...n, x: n.x + dx, y: n.y + dy };
                }
                return n;
            }));
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    }, [isDraggingCanvas, draggingNodeId, dragStart, panStart, scale]);

    const handleMouseUp = () => {
        setIsDraggingCanvas(false);
        setDraggingNodeId(null);
    };

    useEffect(() => {
        if (isDraggingCanvas || draggingNodeId) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingCanvas, draggingNodeId, handleMouseMove]);


    // Dynamic Relation Detection
    const getRelations = () => {
        const relations: { source: string, target: string, type: string }[] = [];

        // Loop through all nodes (tables)
        nodes.forEach(sourceNode => {
            sourceNode.columns.forEach(col => {
                if (!col.name) return;

                // Heuristic: Check for columns ending in _id
                if (col.name.endsWith('_id')) {
                    const potentialTableName = col.name.replace('_id', 's'); // e.g. user_id -> users
                    const singularTableName = col.name.replace('_id', ''); // e.g. category_id -> category

                    // Try plural match first
                    let targetNode = nodes.find(n => n.id === potentialTableName);

                    // Try singular match
                    if (!targetNode) {
                        targetNode = nodes.find(n => n.id === singularTableName);
                    }

                    // Avoid self-reference for simplicity unless explicit
                    if (targetNode && targetNode.id !== sourceNode.id) {
                        relations.push({
                            source: sourceNode.id,
                            target: targetNode.id,
                            type: 'N:1' // Assumption: FK is usually N side
                        });
                    }
                }
            });
        });

        return relations;
    };

    // --- PROFESSIONAL PATH FINDING LOGIC ---
    // Calculates the intersection point on the bounding box of a node
    const getSmartAnchor = (source: DiagramNode, target: DiagramNode) => {
        const sourceCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
        const targetCenter = { x: target.x + target.w / 2, y: target.y + target.h / 2 };

        const dx = targetCenter.x - sourceCenter.x;
        const dy = targetCenter.y - sourceCenter.y;

        // Determine which side to anchor to based on the angle
        let anchorX, anchorY, dir;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Connect Left or Right
            if (dx > 0) {
                anchorX = source.x + source.w; // Right
                dir = 'right';
            } else {
                anchorX = source.x; // Left
                dir = 'left';
            }
            anchorY = sourceCenter.y;
        } else {
            // Connect Top or Bottom
            anchorX = sourceCenter.x;
            if (dy > 0) {
                anchorY = source.y + source.h; // Bottom
                dir = 'bottom';
            } else {
                anchorY = source.y; // Top
                dir = 'top';
            }
        }
        return { x: anchorX, y: anchorY, dir };
    };

    const renderConnections = () => {
        const relations = getRelations();

        return (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                <defs>
                    {/* Start Marker: A clean white dot with grey border (Socket) */}
                    <marker id="connector-start" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                        <circle cx="5" cy="5" r="3" fill="white" stroke="#94a3b8" strokeWidth="1.5" />
                    </marker>

                    {/* End Marker: A sleek chevron/arrow instead of a heavy block */}
                    <marker id="connector-end" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                        <path d="M2,2 L10,6 L2,10" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </marker>
                </defs>
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
                    {relations.map((rel, i) => {
                        const sourceNode = nodes.find(n => n.id === rel.source);
                        const targetNode = nodes.find(n => n.id === rel.target);
                        if (!sourceNode || !targetNode) return null;

                        const start = getSmartAnchor(sourceNode, targetNode);
                        const end = getSmartAnchor(targetNode, sourceNode);

                        // Generate Path
                        let d = '';
                        // Simple Bezier Logic
                        const controlDist = Math.abs(start.x - end.x) * 0.5;

                        if (start.dir === 'right' || start.dir === 'left') {
                            d = `M ${start.x} ${start.y} C ${start.x + (start.dir === 'right' ? controlDist : -controlDist)} ${start.y}, ${end.x + (end.dir === 'right' ? controlDist : -controlDist)} ${end.y}, ${end.x} ${end.y}`;
                        } else {
                            // Vertical control points
                            const vControl = Math.abs(start.y - end.y) * 0.5;
                            d = `M ${start.x} ${start.y} C ${start.x} ${start.y + (start.dir === 'bottom' ? vControl : -vControl)}, ${end.x} ${end.y + (end.dir === 'bottom' ? vControl : -vControl)}, ${end.x} ${end.y}`;
                        }

                        return (
                            <g key={i}>
                                <path
                                    d={d}
                                    fill="none"
                                    stroke="#94a3b8"
                                    strokeWidth="1.5"
                                    markerStart="url(#connector-start)"
                                    markerEnd="url(#connector-end)"
                                    className="transition-all duration-300"
                                />
                                {/* Relationship Badge on center of curve */}
                                <rect x={(start.x + end.x) / 2 - 14} y={(start.y + end.y) / 2 - 9} width="28" height="18" rx="4" fill="white" stroke="#e2e8f0" />
                                <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 + 4} fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                                    {rel.type}
                                </text>
                            </g>
                        )
                    })}
                </g>
            </svg>
        );
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-6xl bg-white rounded-xl shadow-2xl flex flex-col h-[90vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white z-20 shadow-sm shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                            <Table className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-0.5">
                                <DatabaseIcon className="w-3 h-3" /> {viewingTable.dbName}
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 font-mono">
                                {viewingTable.tableName || 'Relationship Designer'}
                            </h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {viewingTable.mode !== 'RELATIONS' && (
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button onClick={() => switchMode('BROWSE')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${viewingTable.mode === 'BROWSE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <List className="w-3.5 h-3.5" /> Browse
                                </button>
                                <button onClick={() => switchMode('STRUCTURE')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${viewingTable.mode === 'STRUCTURE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <Settings className="w-3.5 h-3.5" /> Structure
                                </button>
                            </div>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-auto bg-slate-50 p-0 relative">
                    {viewingTable.mode === 'RELATIONS' ? (
                        loadingSchema ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                                <p>Analyzing Schema Relations...</p>
                            </div>
                        ) : (
                            <div
                                ref={containerRef}
                                className="w-full h-full bg-slate-50 relative overflow-hidden flex items-center justify-center cursor-move"
                                onWheel={handleWheel}
                                onMouseDown={handleCanvasMouseDown}
                                style={{
                                    backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
                                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                                    backgroundPosition: `${pan.x}px ${pan.y}px`
                                }}
                            >
                                {/* Visual Controls */}
                                <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
                                    <div className="bg-white/90 backdrop-blur p-2 rounded-lg border border-slate-200 text-xs text-slate-500 shadow-sm">
                                        <p className="font-bold flex items-center gap-2 text-indigo-600"><LayoutTemplate className="w-4 h-4" /> Schema Designer</p>
                                        <p>Auto-Generated from Real Database.</p>
                                    </div>
                                    <div className="flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden w-8">
                                        <button onClick={() => setScale(s => Math.min(s + 0.1, 2.5))} className="p-2 hover:bg-slate-100 border-b border-slate-100" title="Zoom In"><ZoomIn className="w-4 h-4 text-slate-600" /></button>
                                        <button onClick={() => setScale(s => Math.max(s - 0.1, 0.5))} className="p-2 hover:bg-slate-100 border-b border-slate-100" title="Zoom Out"><ZoomOut className="w-4 h-4 text-slate-600" /></button>
                                        <button onClick={() => { setScale(0.8); setPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-slate-100" title="Reset View"><Maximize className="w-4 h-4 text-slate-600" /></button>
                                    </div>
                                </div>

                                {/* Layers */}
                                {renderConnections()}

                                <div
                                    className="absolute top-0 left-0 w-full h-full pointer-events-none origin-top-left"
                                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
                                >
                                    {nodes.map((node) => (
                                        <div
                                            key={node.id}
                                            className={`absolute rounded-lg shadow-[0_4px_20px_-2px_rgba(0,0,0,0.1)] border flex flex-col pointer-events-auto transition-shadow duration-200 select-none
                                                ${node.type === 'main' ? 'bg-white border-indigo-500 ring-4 ring-indigo-50 z-30' : 'bg-white border-slate-300 z-20'}
                                                ${draggingNodeId === node.id ? 'shadow-2xl scale-[1.02] cursor-grabbing' : 'hover:shadow-lg'}`}
                                            style={{
                                                left: node.x,
                                                top: node.y,
                                                width: node.w
                                            }}
                                        >
                                            {/* Node Header */}
                                            <div
                                                className={`px-3 py-2 border-b flex justify-between items-center rounded-t-lg cursor-grab active:cursor-grabbing
                                                    ${node.type === 'main' ? 'bg-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                            >
                                                <span className="font-bold text-sm flex items-center gap-2 truncate">
                                                    <Table className={`w-3.5 h-3.5 ${node.type === 'main' ? 'text-indigo-200' : 'text-slate-400'}`} />
                                                    {node.id}
                                                </span>
                                                {node.type === 'main' && <div className="w-2 h-2 rounded-full bg-green-400 border border-green-600" />}
                                            </div>

                                            {/* Node Body (Columns) */}
                                            <div className="bg-white rounded-b-lg overflow-hidden flex flex-col">
                                                {node.columns.slice(0, 8).map((col, idx) => {
                                                    const isPK = col.key === 'PRI';
                                                    const isFK = col.key === 'MUL'; // Simplified FK check

                                                    return (
                                                        <div key={idx} className={`flex justify-between items-center px-3 py-1.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-[11px] ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                {/* Key Indicator */}
                                                                <div className="w-4 flex justify-center shrink-0">
                                                                    {isPK ? (
                                                                        <Key className="w-3 h-3 text-amber-500 fill-amber-100" />
                                                                    ) : isFK ? (
                                                                        <Link className="w-3 h-3 text-blue-500" />
                                                                    ) : (
                                                                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                                                                    )}
                                                                </div>
                                                                {/* Column Name */}
                                                                <span className={`font-mono truncate ${isPK ? 'font-bold text-slate-800' : isFK ? 'font-medium text-blue-700' : 'text-slate-600'}`}>
                                                                    {col.name}
                                                                </span>
                                                            </div>
                                                            {/* Data Type Badge */}
                                                            <span className="text-[9px] text-slate-400 font-sans uppercase tracking-tight bg-slate-100 px-1 rounded ml-2 shrink-0">
                                                                {col.type?.split('(')[0]}
                                                            </span>
                                                        </div>
                                                    );
                                                })}

                                                {node.columns.length > 8 && (
                                                    <div className="px-3 py-1.5 text-[10px] text-center text-slate-400 italic bg-slate-50 border-t border-slate-100">
                                                        + {node.columns.length - 8} more columns
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : viewingTable.mode === 'BROWSE' ? (
                        // ... [Existing Browse Mode] ...
                        <div className="inline-block min-w-full align-middle">
                            <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between bg-white text-xs shrink-0">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => openEditor()} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded hover:bg-emerald-100 flex items-center gap-1 font-medium transition-colors">
                                        <Plus className="w-3 h-3" /> Insert Row
                                    </button>
                                    {selectedIds.length > 0 && (
                                        <button onClick={() => onDelete(selectedIds)} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded hover:bg-red-100 flex items-center gap-1 font-medium transition-colors animate-in fade-in">
                                            <Trash2 className="w-3 h-3" /> Delete Selected ({selectedIds.length})
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-slate-500">
                                    <div className="relative">
                                        <Search className="w-3 h-3 absolute left-2 top-1.5 text-slate-400" />
                                        <input type="text" placeholder="Search data..." className="pl-7 pr-3 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:border-indigo-400 w-32" />
                                    </div>
                                    <button onClick={onRefresh} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"><RefreshCw className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <table className="min-w-full divide-y divide-slate-200 border-b border-slate-200">
                                <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th scope="col" className="w-12 px-4 py-3 text-center">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={data.data.length > 0 && selectedIds.length === data.data.length} onChange={() => toggleSelectAll(data.data.map((_, i) => i))} />
                                        </th>
                                        {data.columns.map((col) => (
                                            <th key={col.name} scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider font-mono border-l border-slate-200 whitespace-nowrap">{col.name}</th>
                                        ))}
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider border-l border-slate-200 bg-slate-100 sticky right-0 shadow-[-5px_0px_10px_rgba(0,0,0,0.02)]">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {data.data.length > 0 ? (
                                        data.data.map((row: any, idx) => (
                                            <tr key={idx} className={`hover:bg-indigo-50/20 ${selectedIds.includes(idx) ? 'bg-indigo-50/30' : ''}`}>
                                                <td className="px-4 py-3 text-center">
                                                    <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedIds.includes(idx)} onChange={() => toggleSelection(idx)} />
                                                </td>
                                                {data.columns.map((col, vIdx) => (
                                                    <td key={vIdx} className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 font-mono border-l border-slate-100 max-w-[200px] truncate" title={String(row[col.name])}>
                                                        {row[col.name] === null ? <span className="text-slate-300 italic">NULL</span> : String(row[col.name])}
                                                    </td>
                                                ))}
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right border-l border-slate-100 bg-white sticky right-0 shadow-[-5px_0px_10px_rgba(0,0,0,0.02)]">
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => openEditor(row, idx)} className="text-indigo-600 hover:text-indigo-800 text-xs flex items-center gap-1"><Edit2 className="w-3 h-3" /> Edit</button>
                                                        <button onClick={() => onDelete([idx])} className="text-red-600 hover:text-red-800 text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Del</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={data.columns.length + 2} className="px-6 py-12 text-center text-slate-500 italic bg-white">This table is empty.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        // ... [Existing Structure Mode] ...
                        <div className="inline-block min-w-full align-middle">
                            <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between bg-white text-xs shrink-0">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => openEditor()} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded hover:bg-emerald-100 flex items-center gap-1 font-medium transition-colors">
                                        <Plus className="w-3 h-3" /> Add Column
                                    </button>
                                </div>
                                <button onClick={onRefresh} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"><RefreshCw className="w-3.5 h-3.5" /></button>
                            </div>
                            <table className="min-w-full divide-y divide-slate-200 border-b border-slate-200">
                                <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="w-12 px-4 py-3 text-center">
                                            <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={(data.columns?.length || 0) > 0 && selectedIds.length === (data.columns?.length || 0)} onChange={() => toggleSelectAll((data.columns || []).map((_, i) => i))} />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">#</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Collation</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Null</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Default</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Extra</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider sticky right-0 bg-slate-100">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {(data.columns || []).map((col, idx) => (
                                        <tr key={idx} className={`hover:bg-slate-50 ${selectedIds.includes(idx) ? 'bg-indigo-50/30' : ''}`}>
                                            <td className="px-4 py-3 text-center">
                                                <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedIds.includes(idx)} onChange={() => toggleSelection(idx)} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-400 font-mono">{idx + 1}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-slate-700 font-mono flex items-center gap-2">
                                                {col.key === 'PRI' && <Key className="w-3 h-3 text-amber-500 fill-amber-100" />}
                                                {col.key === 'UNI' && <Fingerprint className="w-3 h-3 text-slate-400" />}
                                                {col.key === 'MUL' && <Link className="w-3 h-3 text-blue-500" />}
                                                {col.name}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-indigo-600 font-mono uppercase">{col.type}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">{col.collation || '-'}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600 font-bold">{col.null}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">{col.default || <span className="italic text-slate-300">None</span>}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono uppercase">{col.extra || '-'}</td>
                                            <td className="px-4 py-3 text-right sticky right-0 bg-white">
                                                <div className="flex justify-end gap-3 text-slate-400">
                                                    <button onClick={() => openEditor(col, idx)} className="hover:text-indigo-600"><Edit2 className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => onDelete([idx])} className="hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-between items-center text-xs text-slate-500 shrink-0">
                    <div>{viewingTable.mode === 'BROWSE' ? `Total: ${data.data.length} row(s)` : viewingTable.mode === 'STRUCTURE' ? `Total: ${data.columns.length} column(s)` : `Visual Mode: Interactive ERD (${nodes.length} Tables)`}</div>
                    <div className="font-mono text-[10px] text-slate-400">Query took 0.0001 sec (Memory)</div>
                </div>
            </div>

            {/* Editor Modal (Existing) */}
            {isEditingItem && (
                <div className="absolute inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">{editTargetIndex !== null ? 'Edit' : 'Insert'} {viewingTable.mode === 'BROWSE' ? 'Row' : 'Column'}</h3>
                            <button onClick={() => setIsEditingItem(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {viewingTable.mode === 'BROWSE' ? (
                                data.columns.map(col => (
                                    <div key={col.name} className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">{col.name} <span className="text-indigo-400 font-normal normal-case">({col.type})</span></label>
                                        {col.extra === 'auto_increment' && editTargetIndex === null ? (
                                            <div className="flex items-center">
                                                <input type="text" disabled value="(Auto Generated)" className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded text-slate-400 italic text-sm cursor-not-allowed" />
                                            </div>
                                        ) : (
                                            <input
                                                type={col.type.includes('int') ? "number" : "text"}
                                                value={formData[col.name] || ''}
                                                onChange={e => setFormData({ ...formData, [col.name]: e.target.value })}
                                                className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono text-slate-700 placeholder:text-slate-300"
                                                placeholder={col.default === 'NULL' ? 'NULL' : col.default || ''}
                                            />
                                        )}
                                    </div>
                                ))
                            ) : (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Column Name</label>
                                        <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                                            <select value={formData.type || 'varchar(255)'} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                                                <option value="int(11)">INT</option>
                                                <option value="bigint(20)">BIGINT</option>
                                                <option value="varchar(255)">VARCHAR</option>
                                                <option value="text">TEXT</option>
                                                <option value="date">DATE</option>
                                                <option value="timestamp">TIMESTAMP</option>
                                                <option value="boolean">BOOLEAN</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Default</label>
                                            <input type="text" value={formData.default || ''} onChange={e => setFormData({ ...formData, default: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="NULL" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Attributes</label>
                                            <div className="flex flex-col gap-2 p-2 border border-slate-200 rounded">
                                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={formData.null === 'YES'} onChange={e => setFormData({ ...formData, null: e.target.checked ? 'YES' : 'NO' })} className="accent-indigo-600" /> Nullable</label>
                                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={formData.key === 'PRI'} onChange={e => setFormData({ ...formData, key: e.target.checked ? 'PRI' : '' })} className="accent-indigo-600" /> Primary Key</label>
                                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={formData.extra === 'auto_increment'} onChange={e => setFormData({ ...formData, extra: e.target.checked ? 'auto_increment' : '' })} className="accent-indigo-600" /> Auto Increment</label>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setIsEditingItem(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-medium text-sm transition-colors">Cancel</button>
                            <button onClick={handleSaveInternal} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded font-medium text-sm shadow-sm flex items-center gap-2 transition-colors"><Save className="w-4 h-4" /> Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
