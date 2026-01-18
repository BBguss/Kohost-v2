import React, { useState, useEffect, useRef } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { api } from '../../services/api';
import { User, SupportTicket, ChatMessage } from '../../types';
import { Plus, Send, MessageSquare, Lock, Clock } from 'lucide-react';

interface SupportCenterProps {
    user: User;
}

export const SupportCenter: React.FC<SupportCenterProps> = ({ user }) => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if(user?.id) loadTickets();
    }, [user?.id]);

    useEffect(() => {
        if (selectedTicketId) loadMessages(selectedTicketId);
    }, [selectedTicketId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedTicketId]); // Scroll on new message or new selection

    const loadTickets = async () => {
        if (!user?.id) return;
        const data = await api.tickets.list(user.id);
        setTickets(data);
    };

    const loadMessages = async (ticketId: string) => {
        const data = await api.tickets.getMessages(ticketId);
        setMessages(data);
    };

    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubject.trim()) return;
        const ticket = await api.tickets.create(user.id, user.username, newSubject);
        setTickets([ticket, ...tickets]);
        setNewSubject('');
        setIsCreating(false);
        setSelectedTicketId(ticket.id);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedTicketId) return;
        const sent = await api.tickets.sendMessage(selectedTicketId, user.id, user.username, newMessage, false);
        setMessages([...messages, sent]);
        setNewMessage('');
    };

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);

     // Helper to get class for ticket item based on status & selection
    const getTicketItemClass = (ticket: SupportTicket, isSelected: boolean) => {
        const baseClass = "p-3 rounded-lg border cursor-pointer transition-all";
        
        if (isSelected) {
            return `${baseClass} bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200 shadow-sm`;
        }
        
        if (ticket.status === 'CLOSED') {
            return `${baseClass} bg-slate-50 border-slate-100 opacity-70 hover:opacity-100 hover:border-slate-300 grayscale-[0.3]`;
        }
        
        return `${baseClass} bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm`;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)] animate-in fade-in duration-300">
            {/* Ticket List */}
            <div className="md:col-span-1 flex flex-col gap-4 h-full">
                 {/* Replaced Card with Custom Flex Div */}
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                     <div className="flex justify-between items-center px-6 pt-6 mb-4 shrink-0">
                         <h3 className="font-bold text-slate-800">My Tickets</h3>
                         <button onClick={() => setIsCreating(true)} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"><Plus className="w-4 h-4" /></button>
                     </div>
                     
                     {/* Create Ticket Form Inline */}
                     {isCreating && (
                         <div className="px-6 pb-2 shrink-0">
                            <form onSubmit={handleCreateTicket} className="p-3 bg-white rounded-lg border border-indigo-200 shadow-sm animate-in slide-in-from-top-2">
                                <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Subject..." className="w-full mb-2 px-3 py-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setIsCreating(false)} className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1">Cancel</button>
                                    <button type="submit" className="text-xs bg-indigo-600 text-white px-3 py-1 rounded font-medium shadow-sm hover:bg-indigo-700">Create Ticket</button>
                                </div>
                            </form>
                         </div>
                     )}

                     <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2 custom-scrollbar">
                         {tickets.map(ticket => (
                             <div 
                                key={ticket.id} 
                                onClick={() => setSelectedTicketId(ticket.id)} 
                                className={getTicketItemClass(ticket, selectedTicketId === ticket.id)}
                             >
                                 <div className="flex justify-between items-start mb-1">
                                     <span className={`font-medium text-sm truncate pr-2 ${ticket.status === 'CLOSED' ? 'text-slate-500' : 'text-slate-800'}`}>{ticket.subject}</span>
                                     <StatusBadge status={ticket.status} />
                                 </div>
                                 <div className="flex justify-between items-center text-xs text-slate-400">
                                     <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ticket.lastMessageAt).toLocaleDateString()}</span>
                                     <span className="font-mono opacity-70">#{ticket.id.slice(-4)}</span>
                                 </div>
                             </div>
                         ))}
                         {tickets.length === 0 && !isCreating && (
                            <div className="text-center py-12 text-slate-400">
                                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No tickets found.</p>
                            </div>
                         )}
                     </div>
                 </div>
            </div>
            
            {/* Chat Area */}
            <div className="md:col-span-2 h-full">
                {/* Custom Flex Container */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                    {selectedTicket ? (
                        <>
                            {/* Static Header */}
                            <div className="p-4 border-b border-slate-100 bg-white z-10 shrink-0 flex justify-between items-center shadow-sm">
                                <div>
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        {selectedTicket.subject}
                                        {selectedTicket.status === 'CLOSED' && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                                    </h3>
                                    <p className="text-xs text-slate-500">Ticket ID: {selectedTicket.id}</p>
                                </div>
                                <StatusBadge status={selectedTicket.status} />
                            </div>

                            {/* Scrollable Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.isAdmin ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>
                                            <p className="mb-1 leading-relaxed">{msg.text}</p>
                                            <div className={`text-[10px] ${msg.isAdmin ? 'text-slate-400' : 'text-indigo-200'} text-right mt-1`}>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </div>
                                    </div>
                                ))}
                                {messages.length === 0 && <div className="text-center py-12 text-slate-400"><MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" /><p>Start the conversation...</p></div>}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Static Footer (Input) */}
                            <div className="shrink-0 bg-white border-t border-slate-100 p-4">
                                {selectedTicket.status === 'OPEN' ? (
                                    <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
                                        <div className="flex-1 bg-slate-100 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition-all border border-transparent focus-within:border-indigo-200">
                                            <textarea 
                                                value={newMessage} 
                                                onChange={e => setNewMessage(e.target.value)} 
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage(e);
                                                    }
                                                }}
                                                placeholder="Type your message... (Shift+Enter for new line)" 
                                                className="w-full bg-transparent border-none outline-none text-sm px-2 resize-none max-h-32 min-h-[24px]"
                                                rows={1}
                                                style={{height: 'auto', minHeight: '40px'}}
                                            />
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={!newMessage.trim()} 
                                            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </form>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500 font-medium py-2 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                                        <Lock className="w-4 h-4" /> This ticket is closed.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/30">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                                <MessageSquare className="w-10 h-10 text-slate-300" />
                            </div>
                            <p className="font-medium">Select a ticket to view conversation</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};