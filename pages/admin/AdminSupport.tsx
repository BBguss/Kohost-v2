import React, { useState, useEffect, useRef } from 'react';
import { Card, StatusBadge } from '../../components/Shared';
import { api } from '../../services/api';
import { SupportTicket, ChatMessage } from '../../types';
import { Send, MessageSquare, Lock, Ban, AlertTriangle, Loader2, CheckCircle2, Clock } from 'lucide-react';

export const AdminSupport: React.FC = () => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    
    // Close Ticket State
    const [ticketToClose, setTicketToClose] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadTickets();
    }, []);

    useEffect(() => {
        if (selectedTicketId) {
            loadMessages(selectedTicketId);
        }
    }, [selectedTicketId]);

    // Scroll to bottom when messages change
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedTicketId]);

    const loadTickets = async () => {
        const data = await api.tickets.list(); // Load all for admin
        setTickets(data);
    };

    const loadMessages = async (ticketId: string) => {
        const data = await api.tickets.getMessages(ticketId);
        setMessages(data);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedTicketId) return;
        
        // Use a static admin ID for now
        const sent = await api.tickets.sendMessage(selectedTicketId, 'admin_id', 'Support Agent', newMessage, true);
        setMessages([...messages, sent]);
        setNewMessage('');
    };

    const initiateCloseTicket = () => {
        if (selectedTicketId) {
            setTicketToClose(selectedTicketId);
        }
    };

    const confirmCloseTicket = async () => {
        if (!ticketToClose) return;
        
        setIsClosing(true);
        try {
            await api.tickets.close(ticketToClose);
            // Update local state immediately without full reload
            setTickets(prev => prev.map(t => 
                t.id === ticketToClose ? { ...t, status: 'CLOSED' } : t
            ));
            setTicketToClose(null);
        } catch (e) {
            alert("Failed to close ticket");
        } finally {
            setIsClosing(false);
        }
    }

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);

    // Helper to get class for ticket item based on status & selection
    const getTicketItemClass = (ticket: SupportTicket, isSelected: boolean) => {
        const baseClass = "p-3 rounded-lg border cursor-pointer transition-all relative overflow-hidden";
        
        if (isSelected) {
            return `${baseClass} bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200 shadow-sm z-10`;
        }
        
        if (ticket.status === 'CLOSED') {
            return `${baseClass} bg-slate-50 border-slate-100 opacity-70 hover:opacity-100 hover:border-slate-300 grayscale-[0.3]`;
        }
        
        return `${baseClass} bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm`;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-140px)] animate-in fade-in duration-300 relative">
            {/* Ticket List */}
            <div className="md:col-span-1 flex flex-col gap-4 h-full">
                 {/* Replaced Card with Custom Div to control layout better */}
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                     <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 px-6 pt-6 shrink-0">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                        Incoming Tickets
                     </h3>
                     <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2 custom-scrollbar">
                         {tickets.map(ticket => (
                             <div 
                                key={ticket.id}
                                onClick={() => setSelectedTicketId(ticket.id)}
                                className={getTicketItemClass(ticket, selectedTicketId === ticket.id)}
                             >
                                 <div className="flex justify-between items-start mb-1">
                                     <span className={`font-bold text-xs truncate uppercase ${selectedTicketId === ticket.id ? 'text-indigo-700' : 'text-slate-600'}`}>
                                        {ticket.username}
                                     </span>
                                     <StatusBadge status={ticket.status} />
                                 </div>
                                 <div className={`font-medium text-sm truncate mb-1 ${ticket.status === 'CLOSED' ? 'text-slate-500' : 'text-slate-800'}`}>
                                     {ticket.subject}
                                 </div>
                                 <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                     <Clock className="w-3 h-3" />
                                     {new Date(ticket.lastMessageAt).toLocaleString()}
                                 </div>
                             </div>
                         ))}
                         {tickets.length === 0 && (
                             <div className="text-center py-8 text-slate-400 text-sm">No tickets found.</div>
                         )}
                     </div>
                 </div>
            </div>

            {/* Chat Area */}
            <div className="md:col-span-2 h-full">
                {/* Custom Flex Container replacing Card for Chat */}
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
                                    <p className="text-xs text-slate-500">User: {selectedTicket.username} | ID: {selectedTicket.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                     <StatusBadge status={selectedTicket.status} />
                                     {selectedTicket.status === 'OPEN' && (
                                         <button 
                                            onClick={initiateCloseTicket} 
                                            className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 text-red-600 font-medium flex items-center gap-1 transition-colors"
                                            title="Mark as Resolved"
                                         >
                                             <CheckCircle2 className="w-3 h-3" />
                                             Close Ticket
                                         </button>
                                     )}
                                </div>
                            </div>
                            
                            {/* Scrollable Messages Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.isAdmin ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                            msg.isAdmin 
                                            ? 'bg-indigo-600 text-white rounded-tr-none'
                                            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none' 
                                        }`}>
                                            {!msg.isAdmin && <div className="text-xs font-bold text-slate-500 mb-1">{msg.senderName}</div>}
                                            <p className="mb-1 leading-relaxed">{msg.text}</p>
                                            <div className={`text-[10px] ${msg.isAdmin ? 'text-indigo-200' : 'text-slate-400'} text-right mt-1`}>
                                                {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Static Input Area (Sticky Footer) */}
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
                                                placeholder="Type your reply... (Shift+Enter for new line)"
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
                                        <Ban className="w-4 h-4" />
                                        This ticket is closed. Re-open functionality not available in demo.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/30">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                                <MessageSquare className="w-10 h-10 text-slate-300" />
                            </div>
                            <p className="font-medium">Select a ticket to reply</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Close Ticket Confirmation Modal */}
            {ticketToClose && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isClosing && setTicketToClose(null)} />
                    <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 rounded-full shrink-0">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Close Ticket?</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Are you sure you want to mark this ticket as resolved? The user will no longer be able to send messages.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button 
                                onClick={() => setTicketToClose(null)} 
                                disabled={isClosing}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmCloseTicket} 
                                disabled={isClosing}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2"
                            >
                                {isClosing && <Loader2 className="w-4 h-4 animate-spin" />}
                                Close Ticket
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}