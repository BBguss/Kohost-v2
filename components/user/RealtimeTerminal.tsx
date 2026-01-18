
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Terminal, X, Loader2, AlertCircle, CheckCircle2, Wifi, WifiOff, Play, Command } from 'lucide-react';
import { SAFE_COMMANDS } from '../../constants';
import { Framework } from '../../types';

interface TerminalLine {
  id: string;
  content: string;
  type: 'command' | 'stdout' | 'stderr' | 'info' | 'success' | 'error';
  timestamp: Date;
}

interface RealTimeTerminalProps {
  siteId: string;
  siteName: string;
  framework: Framework;
}

export default function RealTimeTerminal({ siteId, siteName, framework }: RealTimeTerminalProps) {
  const [socket, setSocket] = useState<any | null>(null);
  const [connected, setConnected] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get available commands based on framework
  const quickActions = SAFE_COMMANDS[framework] || [];

  // Clear lines when switching sites
  useEffect(() => {
      setLines([]);
      setHistory([]);
      setInput('');
  }, [siteId]);

  // Helper to strip ANSI codes (Output)
  const stripAnsi = (str: string) => {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  // Helper to prettify command display (Input/Echo)
  const formatCommandDisplay = (cmd: string) => {
      let display = cmd;
      // Remove path export prefix
      display = display.replace(/^export PATH=.* &&\s*/, '');
      // Replace full PHP path with just 'php'
      display = display.replace(/\/usr\/local\/bin\/php\d+\s+/g, 'php ');
      display = display.replace(/\/usr\/local\/bin\/php\s+/g, 'php ');
      // Replace full Composer path
      display = display.replace(/\/usr\/local\/bin\/composer\s+/g, 'composer ');
      // Replace full Artisan path
      display = display.replace(/php\s+.*artisan/g, 'php artisan');
      
      return display;
  };

  useEffect(() => {
    // Get auth token from localStorage (using kp_token as per app convention)
    const token = localStorage.getItem('kp_token');
    
    if (!token) {
      addLine('Error: No authentication token found. Please login again.', 'error');
      return;
    }

    // Connect to WebSocket via Vite Proxy (points to /socket.io on backend)
    const socketInstance: any = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      path: '/socket.io'
    } as any);

    socketInstance.on('connect', () => {
      setConnected(true);
      addLine(`Connected to KolabPanel Terminal Server`, 'success');
      addLine(`Target Instance: ${siteName} (${siteId})`, 'info');
      addLine(`Environment detected: ${framework}`, 'info');
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
      addLine('Disconnected from server. Reconnecting...', 'error');
    });

    socketInstance.on('command_started', (data: any) => {
      setExecuting(true);
      // Clean up the echoed command in log as well if it comes back
      const prettyCmd = formatCommandDisplay(data.command);
      addLine(`Executing [${data.type}]: ${prettyCmd}`, 'info');
    });

    socketInstance.on('command_output', (data: any) => {
      // Split by newline to handle chunks properly
      // Clean ANSI codes immediately before displaying
      const cleanData = stripAnsi(data.data);
      
      const rawLines = cleanData.split('\n');
      rawLines.forEach((line: string) => {
        // Only add if line has content
        if (line !== undefined && line !== '') { 
          addLine(line, data.type);
        }
      });
    });

    socketInstance.on('command_completed', (data: any) => {
      setExecuting(false);
      addLine(`✓ Command completed successfully`, 'success');
      // Refocus input after command finishes
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    socketInstance.on('command_error', (data: any) => {
      setExecuting(false);
      addLine(`✗ Error: ${data.error}`, 'error');
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [siteId, siteName, framework]);

  useEffect(() => {
    // Auto scroll to bottom
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const addLine = (content: string, type: TerminalLine['type']) => {
    const newLine: TerminalLine = {
      id: `${Date.now()}-${Math.random()}`,
      content,
      type,
      timestamp: new Date()
    };
    setLines(prev => [...prev, newLine]);
  };

  const executeCommand = (commandOverride?: string) => {
    // Use override if clicked from button, otherwise use input state
    const commandToRun = commandOverride || input.trim();

    if (!commandToRun || !socket || !connected || executing) return;
    
    // Add command to display (PRETTIFIED)
    const prettyDisplay = formatCommandDisplay(commandToRun);
    addLine(`$ ${prettyDisplay}`, 'command');
    
    // Add to history if not empty
    setHistory(prev => [...prev, commandToRun]);
    setHistoryIndex(-1);
    
    // Send command via WebSocket (RAW)
    socket.emit('execute_command', {
      command: commandToRun,
      siteId
    });
    
    // Clear input if manually typed
    if (!commandOverride) {
        setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    }
  };

  const clearTerminal = () => {
    setLines([]);
    addLine('Terminal cleared', 'info');
    inputRef.current?.focus();
  };

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'command': return 'text-blue-400 font-bold';
      case 'stdout': return 'text-slate-300';
      // Change stderr from red to a softer amber/orange because CLI tools use stderr for info too
      case 'stderr': return 'text-amber-200/90'; 
      case 'info': return 'text-yellow-400';
      case 'success': return 'text-emerald-400';
      case 'error': return 'text-red-500 bg-red-900/20 px-1';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 flex flex-col h-full shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-slate-800 rounded-lg border border-slate-700">
             <Terminal className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
             <h3 className="font-bold text-slate-200 text-sm">Real-time Terminal</h3>
             <p className="text-[10px] text-slate-500 font-mono">root@kolab-runner:/var/www/{siteName}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700">
            {connected ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-500" />
                <span className="text-xs text-emerald-500 font-medium">
                  {executing ? 'Executing...' : 'Online'}
                </span>
                {executing && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-red-500" />
                <span className="text-xs text-red-500 font-medium">Offline</span>
              </>
            )}
          </div>
          
          {/* Clear Button */}
          <button
            onClick={clearTerminal}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 hover:bg-slate-800 rounded-lg"
            title="Clear terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Actions Toolbar */}
      {quickActions.length > 0 && (
        <div className="bg-slate-900/50 border-b border-slate-800 px-2 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
            <div className="text-[10px] font-bold text-slate-500 uppercase px-2 shrink-0 flex items-center gap-1">
                <Command className="w-3 h-3" /> Quick Actions:
            </div>
            {quickActions.map(action => (
                <button
                    key={action.id}
                    onClick={() => executeCommand(action.command)}
                    disabled={!connected || executing}
                    title={action.description}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-400 rounded-md text-xs font-mono border border-slate-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                    <Play className="w-3 h-3 text-indigo-500 group-hover:text-indigo-400" />
                    {action.label}
                </button>
            ))}
        </div>
      )}

      {/* Terminal Output */}
      <div 
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-sm overflow-y-auto bg-slate-950 custom-scrollbar"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.length === 0 && (
            <div className="opacity-20 text-center mt-10">
                <Terminal className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                <p className="text-slate-500">Terminal Ready</p>
                <p className="text-xs text-slate-600 mt-2">Type 'help' or click a quick action above</p>
            </div>
        )}
        
        {lines.map((line) => (
          <div key={line.id} className={`${getLineColor(line.type)} whitespace-pre-wrap break-all leading-relaxed`}>
            {line.content}
          </div>
        ))}
        
        {/* Input Line */}
        <div className="flex items-center gap-2 mt-2 group">
            <span className="text-emerald-500 font-bold select-none">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected || executing}
              className="flex-1 bg-transparent border-none outline-none text-slate-200 font-mono disabled:opacity-50 placeholder:text-slate-700 w-full"
              placeholder={!connected ? 'Connecting...' : executing ? 'Waiting for process...' : 'Enter command...'}
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
            {executing && <Loader2 className="w-4 h-4 text-yellow-400 animate-spin opacity-50" />}
        </div>
      </div>

      {/* Help Footer */}
      <div className="bg-slate-900 px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500 shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Allowed: php, composer, npm, git
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Win32/SSH Hybrid Mode
          </span>
        </div>
        <div>
            Use <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">Shift + Enter</span> for multi-line (Simulated)
        </div>
      </div>
    </div>
  );
}
