import { User, HostingPlan, Domain, Payment, SupportTicket, ChatMessage, TunnelRoute, TerminalAction, DiscountCode, PaymentStatus } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, TUNNEL_API_URL, APACHE_API_URL, getAuthHeaders, getAuthHeadersMultipart, isBackendOffline, setBackendOffline } from '../core';
import { delay, getStorage, setStorage, DB_KEYS, INITIAL_USERS, INITIAL_PLANS, INITIAL_DOMAINS, INITIAL_TUNNELS } from '../../mockData';

export const adminApi = {
    getStats: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/stats`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { 
                await delay(300); 
                const users = getStorage(DB_KEYS.USERS, INITIAL_USERS);
                const sites = getStorage(DB_KEYS.SITES, []);
                return { totalUsers: users.length, totalSites: sites.length, activeRevenue: '4.5M', totalTunnels: 1, totalApacheSites: 2 }; 
            }
        );
    },
    getSystemHealth: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/system-health`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => {
                const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
                await delay(100);
                return {
                    cpu: rand(5, 40),
                    memory: {
                        total: 16000000000,
                        free: 16000000000 - rand(4000000000, 8000000000),
                        used: rand(4000000000, 8000000000)
                    },
                    uptime: 123456 + rand(0, 1000),
                    platform: 'Linux x64 (Mock Mode)'
                };
            }
        );
    },
    getUsers: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/users`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(300); return getStorage(DB_KEYS.USERS, INITIAL_USERS); }
        );
    },
    createUser: async (user: any) => {
        await delay(300);
        const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
        const newUser = { ...user, id: 'u_' + Date.now(), status: 'ACTIVE', avatar: `https://ui-avatars.com/api/?name=${user.username}` };
        users.push(newUser);
        setStorage(DB_KEYS.USERS, users);
        return newUser;
    },
    deleteUser: async (id: string) => {
        await delay(300);
        let users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
        users = users.filter(u => u.id !== id);
        setStorage(DB_KEYS.USERS, users);
        return { success: true };
    },
    toggleUserStatus: async (userId: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/users/${userId}/toggle`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                const u = users.find(x => x.id === userId);
                if (u) { u.status = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'; setStorage(DB_KEYS.USERS, users); }
                return { success: true }; 
            }
        );
    },
    getPayments: async () => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/payments`, { headers: getAuthHeaders() });
                return handleResponse(res);
            },
            async () => { await delay(300); return getStorage(DB_KEYS.PAYMENTS, []); }
        );
    },
    verifyPayment: async (id: string, status: any) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/admin/payments/${id}/verify`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ status })
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(300); 
                const payments = getStorage<Payment[]>(DB_KEYS.PAYMENTS, []);
                const p = payments.find(x => x.id === id);
                if (p) { 
                    p.status = status; 
                    setStorage(DB_KEYS.PAYMENTS, payments); 
                    if (status === 'VERIFIED') {
                        const users = getStorage<User[]>(DB_KEYS.USERS, INITIAL_USERS);
                        const u = users.find(x => x.id === p.userId);
                        if (u) { u.plan = p.plan; setStorage(DB_KEYS.USERS, users); }
                    }
                }
                return { success: true }; 
            }
        );
    },
    discounts: {
        list: async () => { return delay(getStorage(DB_KEYS.DISCOUNTS, [])); },
        create: async (code: string, type: 'PERCENT' | 'FIXED', value: number, validPlans: string[]) => { 
            await delay(200); 
            const discounts = getStorage<DiscountCode[]>(DB_KEYS.DISCOUNTS, []);
            discounts.push({ id: `d_${Date.now()}`, code, type, value, validPlans });
            setStorage(DB_KEYS.DISCOUNTS, discounts);
        },
        delete: async (id: string) => { 
            await delay(200); 
            let discounts = getStorage<DiscountCode[]>(DB_KEYS.DISCOUNTS, []);
            discounts = discounts.filter(d => d.id !== id);
            setStorage(DB_KEYS.DISCOUNTS, discounts);
        }
    },
    getTunnelAnalytics: async (limit: number) => {
        try {
            const res = await fetch(`${TUNNEL_API_URL}/analytics/top-hosts?limit=${limit}`);
            if (!res.ok) throw new Error("Analytics API Error");
            const result = await res.json();
            return { data: result.data };
        } catch (e) {
            await delay(300);
            return { data: [] };
        }
    },
    getRevenueAnalytics: async () => {
        await delay(300);
        return [];
    },
    addDomain: async (name: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name })
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                const domains = getStorage<Domain[]>(DB_KEYS.DOMAINS, INITIAL_DOMAINS);
                const newD = { id: 'd_'+Date.now(), name, isPrimary: false };
                domains.push(newD);
                setStorage(DB_KEYS.DOMAINS, domains);
                return newD; 
            }
        );
    },
    updateDomain: async (id: string, data: any) => {
         return fetchWithMockFallback(
            async () => { return { id, ...data }; }, 
            async () => { 
                await delay(200); 
                const domains = getStorage<Domain[]>(DB_KEYS.DOMAINS, INITIAL_DOMAINS);
                const d = domains.find(x => x.id === id);
                if (d) Object.assign(d, data);
                setStorage(DB_KEYS.DOMAINS, domains);
                return d!; 
            }
        );
    },
    deleteDomain: async (id: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                let domains = getStorage<Domain[]>(DB_KEYS.DOMAINS, INITIAL_DOMAINS);
                domains = domains.filter(x => x.id !== id);
                setStorage(DB_KEYS.DOMAINS, domains);
                return { success: true }; 
            }
        );
    },
    createPlan: async (plan: Partial<HostingPlan>) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(plan)
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                const plans = getStorage<HostingPlan[]>(DB_KEYS.PLANS, INITIAL_PLANS);
                const newP = { ...plan, id: 'p_'+Date.now() } as HostingPlan;
                plans.push(newP);
                setStorage(DB_KEYS.PLANS, plans);
                return newP; 
            }
        );
    },
    updatePlan: async (id: string, plan: Partial<HostingPlan>) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans/${id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(plan)
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                const plans = getStorage<HostingPlan[]>(DB_KEYS.PLANS, INITIAL_PLANS);
                const idx = plans.findIndex(x => x.id === id);
                if (idx !== -1) { plans[idx] = { ...plans[idx], ...plan }; setStorage(DB_KEYS.PLANS, plans); }
                return plans[idx]; 
            }
        );
    },
    deletePlan: async (id: string) => {
         return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                return handleResponse(res);
            },
            async () => { 
                await delay(200); 
                let plans = getStorage<HostingPlan[]>(DB_KEYS.PLANS, INITIAL_PLANS);
                plans = plans.filter(x => x.id !== id);
                setStorage(DB_KEYS.PLANS, plans);
                return { success: true }; 
            }
        );
    },
    // CLOUDFLARE TUNNEL INTEGRATION
    tunnels: {
        list: async (): Promise<TunnelRoute[]> => {
            try {
                // Try fetching from real API first
                const res = await fetch(`${TUNNEL_API_URL}/routes`);
                if (!res.ok) throw new Error();
                return await res.json();
            } catch (e) {
                // Fallback to LocalStorage persistence for demo if network fails
                console.warn("Using LocalStorage fallback for Tunnels List");
                return delay(getStorage(DB_KEYS.TUNNELS, INITIAL_TUNNELS));
            }
        },
        create: async (hostname: string, service: string) => {
            let res;
            try {
                // POST to Real API
                res = await fetch(`${TUNNEL_API_URL}/routes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname, service })
                });
            } catch (e) {
                // Network Error -> Fallback
                console.warn("Using LocalStorage fallback for Create Tunnel", e);
                const tunnels = getStorage<TunnelRoute[]>(DB_KEYS.TUNNELS, INITIAL_TUNNELS);
                tunnels.push({ hostname, service });
                setStorage(DB_KEYS.TUNNELS, tunnels);
                return delay(true);
            }

            // Server reachable but might have returned error (e.g. 409 Conflict)
            if (!res.ok) {
                let errorMessage = 'Failed to create route';
                try {
                    const err = await res.json();
                    errorMessage = err.error || errorMessage;
                } catch { /* parse failed */ }
                throw new Error(errorMessage);
            }
            return true;
        },
        delete: async (hostname: string) => {
             let res;
             try {
                res = await fetch(`${TUNNEL_API_URL}/routes`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname })
                });
             } catch (e) {
                 // Network Error -> Fallback
                 let tunnels = getStorage<TunnelRoute[]>(DB_KEYS.TUNNELS, INITIAL_TUNNELS);
                 tunnels = tunnels.filter(t => t.hostname !== hostname);
                 setStorage(DB_KEYS.TUNNELS, tunnels);
                 return delay(true);
             }

             if (!res.ok) {
                 let errorMessage = 'Failed to delete route';
                 try { const err = await res.json(); errorMessage = err.error || errorMessage; } catch {}
                 throw new Error(errorMessage);
             }
             return true;
        },
        edit: async (oldHostname: string, newHostname: string, service: string) => {
             let res;
             try {
                res = await fetch(`${TUNNEL_API_URL}/routes/edit`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname: oldHostname, newHostname, service })
                });
             } catch (e) {
                 // Network Error -> Fallback
                 const tunnels = getStorage<TunnelRoute[]>(DB_KEYS.TUNNELS, INITIAL_TUNNELS);
                 const idx = tunnels.findIndex(t => t.hostname === oldHostname);
                 if (idx !== -1) {
                     tunnels[idx] = { hostname: newHostname, service };
                     setStorage(DB_KEYS.TUNNELS, tunnels);
                 }
                 return delay(true);
             }

             if (!res.ok) {
                 let errorMessage = 'Failed to edit route';
                 try { const err = await res.json(); errorMessage = err.error || errorMessage; } catch {}
                 throw new Error(errorMessage);
             }
             return true;
        }
    },
    // APACHE CONFIG MANAGER
    apache: {
        listSites: async (): Promise<string[]> => {
            try {
                const res = await fetch(`${APACHE_API_URL}/sites`);
                if (!res.ok) throw new Error();
                return res.json();
            } catch (e) {
                return delay(['000-default.conf', 'api-server.conf', 'apache-manager.conf']);
            }
        },
        getSite: async (name: string): Promise<{content: string}> => {
             try {
                 const res = await fetch(`${APACHE_API_URL}/sites/${name}`);
                 if (!res.ok) throw new Error();
                 return res.json();
             } catch (e) {
                 return delay({ content: '# Error fetching content' });
             }
        },
        createSite: async (filename: string, content: string) => {
            try {
                const res = await fetch(`${APACHE_API_URL}/sites`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to create site');
                }
                return await res.json();
            } catch (e: any) {
                throw new Error(e.message);
            }
        },
        updateSite: async (name: string, content: string) => {
             try {
                const res = await fetch(`${APACHE_API_URL}/sites/${name}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to update site');
                }
                return await res.json();
            } catch (e: any) {
                throw new Error(e.message);
            }
        },
        deleteSite: async (name: string) => {
            try {
                const res = await fetch(`${APACHE_API_URL}/sites/${name}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to delete site');
                }
                return await res.json();
            } catch (e: any) {
                throw new Error(e.message);
            }
        },
        getHttpd: async (): Promise<{content: string}> => {
            try {
                const res = await fetch(`${APACHE_API_URL}/httpd`);
                if (!res.ok) throw new Error();
                return res.json();
            } catch (e) {
                return delay({ content: '# Fallback httpd.conf\nListen 80' });
            }
        },
        updateHttpd: async (content: string) => {
             try {
                const res = await fetch(`${APACHE_API_URL}/httpd`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Failed to update httpd.conf');
                }
                return await res.json();
            } catch (e: any) {
                throw new Error(e.message);
            }
        },
        reload: async () => {
             try {
                const res = await fetch(`${APACHE_API_URL}/apache/reload`, {
                    method: 'POST'
                });
                if (!res.ok) throw new Error('Reload failed');
                return await res.json();
            } catch (e: any) {
                throw new Error(e.message);
            }
        }
    }
};

export const commonApi = {
    getPlans: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/plans`);
                return handleResponse(res);
            },
            async () => { await delay(300); return getStorage(DB_KEYS.PLANS, INITIAL_PLANS); }
        );
    },
    getDomains: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains`);
                return handleResponse(res);
            },
            async () => { await delay(300); return getStorage(DB_KEYS.DOMAINS, INITIAL_DOMAINS); }
        );
    }
};

export const ticketsApi = {
      create: async (userId: string, username: string, subject: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ userId, username, subject })
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300);
                  const t: SupportTicket = {
                      id: 't_' + Date.now(),
                      userId,
                      username,
                      subject,
                      status: 'OPEN',
                      createdAt: new Date().toISOString(),
                      lastMessageAt: new Date().toISOString()
                  };
                  const tickets = getStorage<SupportTicket[]>(DB_KEYS.TICKETS, []);
                  tickets.unshift(t);
                  setStorage(DB_KEYS.TICKETS, tickets);
                  return t;
              }
          );
      },
      list: async (userId?: string) => {
           return fetchWithMockFallback(
              async () => {
                  let url = `${API_URL}/tickets`;
                  if(userId) url += `?userId=${userId}`;
                  const res = await fetch(url, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300); 
                  const tickets = getStorage<SupportTicket[]>(DB_KEYS.TICKETS, []);
                  return userId ? tickets.filter(t => t.userId === userId) : tickets;
              }
          );
      },
      getMessages: async (ticketId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300); 
                  const allMessages = getStorage<ChatMessage[]>(DB_KEYS.MESSAGES, []);
                  return allMessages.filter(m => m.ticketId === ticketId);
              }
          );
      },
      sendMessage: async (ticketId: string, senderId: string, senderName: string, text: string, isAdmin: boolean) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/messages`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ senderId, text, isAdmin })
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300);
                  const msg: ChatMessage = {
                      id: 'm_' + Date.now(),
                      ticketId,
                      senderId,
                      senderName,
                      text,
                      timestamp: new Date().toISOString(),
                      isAdmin
                  };
                  const messages = getStorage<ChatMessage[]>(DB_KEYS.MESSAGES, []);
                  messages.push(msg);
                  setStorage(DB_KEYS.MESSAGES, messages);
                  return msg;
              }
          );
      },
      close: async (ticketId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/tickets/${ticketId}/close`, {
                      method: 'PUT',
                      headers: getAuthHeaders()
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(200); 
                  const tickets = getStorage<SupportTicket[]>(DB_KEYS.TICKETS, []);
                  const ticket = tickets.find(t => t.id === ticketId);
                  if (ticket) {
                      ticket.status = 'CLOSED';
                      setStorage(DB_KEYS.TICKETS, tickets);
                  }
                  return { status: 'CLOSED' }; 
              }
          );
      }
};

export const billingApi = {
      getHistory: async (userId: string) => {
           return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/payments/history/${userId}`, { headers: getAuthHeaders() });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(300); 
                  const payments = getStorage<Payment[]>(DB_KEYS.PAYMENTS, []);
                  return payments.filter(p => p.userId === userId);
              }
          );
      },
      submitPayment: async (userId: string, username: string, plan: string, amount: number, method: 'BANK' | 'QR', proofFile: File) => {
           return fetchWithMockFallback(
              async () => {
                  const formData = new FormData();
                  formData.append('userId', userId);
                  formData.append('username', username);
                  formData.append('plan', plan);
                  formData.append('amount', String(amount));
                  formData.append('method', method);
                  formData.append('proof', proofFile);

                  const res = await fetch(`${API_URL}/payments`, {
                      method: 'POST',
                      headers: getAuthHeadersMultipart(),
                      body: formData
                  });
                  return handleResponse(res);
              },
              async () => { 
                  await delay(1000); 
                  const payments = getStorage<Payment[]>(DB_KEYS.PAYMENTS, []);
                  payments.unshift({
                      id: `pay_${Date.now()}`,
                      userId,
                      username,
                      amount,
                      plan,
                      method,
                      status: PaymentStatus.PENDING,
                      date: new Date().toISOString(),
                      proofUrl: 'mock_proof_url.jpg'
                  });
                  setStorage(DB_KEYS.PAYMENTS, payments);
                  return { success: true }; 
              }
          );
      },
      validateCoupon: async (code: string): Promise<DiscountCode> => {
          await delay(300);
          const discounts = getStorage<DiscountCode[]>(DB_KEYS.DISCOUNTS, []);
          const found = discounts.find(d => d.code === code);
          if (found) return found;
          if (code === 'KOLABFREE') return { id: 'promo_free', code, type: 'PERCENT', value: 100, validPlans: [] };
          throw new Error('Invalid coupon code');
      }
};

export const executeTerminalCommand = async (siteId: string, action: TerminalAction, onLog?: (text: string) => void) => {
      // Mock Fallback Logic for Offline/Demo
      if (isBackendOffline) {
          await delay(200);
          if (onLog) {
              const mockLogs = [
                  `[MOCK] Starting ${action.label} on local environment...`,
                  `[MOCK] Executing: ${action.command}`,
                  `[MOCK] Reading configuration...`,
                  `[MOCK] Connecting to database...`,
                  `[MOCK] Processing tasks... 10%`,
                  `[MOCK] Processing tasks... 45%`,
                  `[MOCK] Processing tasks... 80%`,
                  `[MOCK] Finalizing operations...`,
                  `[MOCK] Command completed successfully.`
              ];
              
              for (const log of mockLogs) {
                  onLog(log + '\n');
                  await new Promise(r => setTimeout(r, 600)); // Simulate delay
              }
          }
          return { success: true, output: { stdout: 'Mock Complete', stderr: '', exitCode: 0 } };
      }

      // Real Implementation with Streaming Response
      try {
          const response = await fetch(`${API_URL}/sites/${siteId}/execute`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ 
                  command: action.command,
                  executionMode: action.executionMode || 'ssh' 
              })
          });

          if (!response.body) {
              throw new Error("ReadableStream not supported by browser");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let stdoutAccumulated = '';

          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              stdoutAccumulated += chunk;
              
              if (onLog) {
                  onLog(chunk);
              }
          }

          return { success: true, output: { stdout: stdoutAccumulated, stderr: '', exitCode: 0 } };

      } catch (e: any) {
          console.error("Terminal Error:", e);
          if (isBackendOffline || e.message.includes('NetworkError') || e.message.includes('Failed to fetch')) {
              // Switch to mock if network fails mid-request
              setBackendOffline(true);
              return executeTerminalCommand(siteId, action, onLog); 
          }
          throw e;
      }
  }