
import React, { useState } from 'react';
import { Card } from '../Shared';
import { Site } from '../../types';
import { ChevronDown, Terminal } from 'lucide-react';
import RealTimeTerminal from './RealtimeTerminal';

interface RestrictedTerminalProps {
  sites: Site[];
}

export const RestrictedTerminal: React.FC<RestrictedTerminalProps> = ({ sites }) => {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id || '');
  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0];

  const SiteSelector = () => (
    <div className="relative group">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:block">Active Project:</label>
        <div className="relative">
          <select 
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="appearance-none bg-white border border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-3 pr-8 py-1.5 cursor-pointer outline-none shadow-sm font-medium"
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
      <Card title="Terminal Access">
         <div className="text-center py-12 text-slate-500 flex flex-col items-center">
            <Terminal className="w-12 h-12 mb-2 opacity-20" />
            <p>No sites available. Please deploy a site to access the terminal.</p>
         </div>
      </Card>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-4 px-1 shrink-0">
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Terminal className="w-6 h-6 text-indigo-600" /> Web Terminal
                </h2>
                <p className="text-xs text-slate-500 hidden sm:block">Direct SSH/CLI access to your container.</p>
            </div>
            <SiteSelector />
        </div>
        
        <div className="flex-1 min-h-0 bg-slate-950 rounded-xl shadow-xl border border-slate-800 overflow-hidden relative">
            <RealTimeTerminal 
                siteId={selectedSite.id} 
                siteName={selectedSite.name} 
                framework={selectedSite.framework} 
            />
        </div>
    </div>
  );
};
