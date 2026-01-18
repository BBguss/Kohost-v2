import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../Shared';
import { SAFE_COMMANDS, GENERIC_ACTIONS } from '../../constants';
import { Site, TerminalAction, LogEntry } from '../../types';
import { ChevronDown, AlertTriangle, Play, Terminal } from 'lucide-react';

interface RestrictedTerminalProps {
  sites: Site[];
  onExecute: (siteId: string, action: TerminalAction) => void;
  logs: Record<string, LogEntry[]>; 
  isExecuting: boolean;
}

export const RestrictedTerminal: React.FC<RestrictedTerminalProps> = ({ sites, onExecute, logs, isExecuting }) => {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '');
  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, selectedSiteId]);

  const siteLogs = selectedSite ? (logs[selectedSite.id] || []) : [];
  
  const availableActions = selectedSite 
    ? [...(SAFE_COMMANDS[selectedSite.framework] || []), ...GENERIC_ACTIONS]
    : [];

  const SiteSelector = () => (
    <div className="relative group">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">Active Project:</label>
        <div className="relative">
          <select 
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-8 py-1.5 cursor-pointer outline-none"
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.framework})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!selectedSite) {
    return (
      <Card title="Restricted Terminal">
         <div className="text-center py-12 text-slate-500">
            No sites available.
         </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      {/* Actions Panel */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <Card title="Terminal Control" action={<SiteSelector />}>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>Restricted Shell: Direct input is disabled for security. Only whitelisted actions allowed.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Actions</label>
              <div className="grid gap-2">
                {availableActions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => onExecute(selectedSite.id, action)}
                    disabled={isExecuting}
                    className={`text-left p-3 rounded-lg border transition-all flex items-center justify-between group
                      ${isExecuting 
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' 
                        : 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-sm'
                      }`}
                  >
                    <div>
                      <div className={`font-medium text-sm ${isExecuting ? '' : 'text-slate-800 group-hover:text-indigo-600'}`}>
                        {action.label}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">{action.command}</div>
                    </div>
                    {isExecuting ? (
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                    ) : (
                      <Play className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Console Output */}
      <div className="lg:col-span-2 flex flex-col">
        <div className="bg-slate-900 rounded-t-xl p-3 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-mono text-slate-200">root@kolab-runner:/var/www/{selectedSite.subdomain}</span>
          </div>
          {isExecuting && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-emerald-500 font-mono animate-pulse">EXECUTING</span>
            </div>
          )}
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 bg-slate-950 p-4 font-mono text-sm overflow-y-auto rounded-b-xl shadow-inner border-x border-b border-slate-200/10"
        >
          {siteLogs.length === 0 ? (
            <div className="text-slate-600 italic">No output logs yet...</div>
          ) : (
            <div className="space-y-1">
               {siteLogs.map((log) => (
                 <div key={log.id} className="flex gap-3">
                   <span className="text-slate-600 select-none text-xs w-[70px] shrink-0">{log.timestamp}</span>
                   <span className={`break-all whitespace-pre-wrap ${
                     log.type === 'command' ? 'text-yellow-400 font-bold' :
                     log.type === 'error' ? 'text-red-400' :
                     log.type === 'success' ? 'text-emerald-400' :
                     'text-slate-300'
                   }`}>
                     {log.type === 'command' && <span className="text-slate-500 mr-2">$</span>}
                     {log.text}
                   </span>
                 </div>
               ))}
               {isExecuting && (
                 <div className="animate-pulse text-indigo-500 mt-2">_</div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};