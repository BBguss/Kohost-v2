import { useState } from 'react';
import { LogEntry, TerminalAction } from '../types';
import { api } from '../services/api';

export const useTerminal = () => {
  const [siteLogs, setSiteLogs] = useState<Record<string, LogEntry[]>>({});
  const [isExecuting, setIsExecuting] = useState(false);

  const addLog = (siteId: string, text: string, type: 'info' | 'error' | 'success' | 'command' = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      text,
      type
    };

    setSiteLogs(prev => ({
      ...prev,
      [siteId]: [...(prev[siteId] || []), newLog]
    }));
  };

  const executeCommand = async (siteId: string, action: TerminalAction) => {
    if (isExecuting) return;
    setIsExecuting(true);

    addLog(siteId, action.command, 'command');

    try {
        // We pass a callback to receive streaming logs directly from the backend (or mock)
        await api.executeTerminalCommand(siteId, action, (chunk) => {
            // chunk might contain multiple lines or partial lines
            // For simplicity in the UI list, we can just append it.
            // However, the UI renders LogEntry items.
            // We can split by newline to create distinct entries or just append one large block.
            // Splitting is usually cleaner for terminal output.
            
            const lines = chunk.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    addLog(siteId, line, 'info');
                }
            });
        });
        
        addLog(siteId, 'Process finished.', 'success');
        
    } catch (error: any) {
        addLog(siteId, `Error: ${error.message}`, 'error');
    } finally {
        setIsExecuting(false);
    }
  };

  return {
    siteLogs,
    isExecuting,
    executeCommand
  };
};