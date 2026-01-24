
import { User, HostingPlan, Domain, Payment, SupportTicket, ChatMessage, TunnelRoute, TerminalAction, DiscountCode, PaymentStatus } from '../../../types';
import { fetchWithMockFallback, handleResponse, API_URL, TUNNEL_API_URL, APACHE_API_URL, getAuthHeaders, getAuthHeadersMultipart, isBackendOffline, setBackendOffline } from '../core';
import { delay, getStorage, setStorage, DB_KEYS, INITIAL_USERS, INITIAL_PLANS, INITIAL_DOMAINS, INITIAL_TUNNELS } from '../../mockData';
import { addMockNotification } from './notifications';

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
                await delay(300); 
                return {
                    cpu: Math.floor(Math.random() * 30) + 10,
                    memory: { total: 16 * 1024 * 1024 * 1024, free: 8 * 1024 * 1024 * 1024, used: 8 * 1024 * 1024 * 1024 },
                    uptime: 123456,
                    platform: 'Linux Mock'
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
                    
                    const notifTitle = status === 'VERIFIED' ? 'Payment Approved' : 'Payment Rejected';
                    const notifType = status === 'VERIFIED' ? 'SUCCESS' : 'ERROR';
                    const notifMsg = status === 'VERIFIED' 
                        ? `Your payment for ${p.plan} has been verified. Your plan is now active.` 
                        : `Your payment for ${p.plan} was rejected. Please contact support.`;
                    
                    addMockNotification(p.userId, notifTitle, notifMsg, notifType, 'BILLING');

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
    
    // NOTIFICATION SETTINGS
    settings: {
        getNotifications: async () => {
            return fetchWithMockFallback(
                async () => {
                    const res = await fetch(`${API_URL}/admin/settings/notifications`, { headers: getAuthHeaders() });
                    return handleResponse(res);
                },
                async () => { await delay(200); return { emails: [], waNumber: '', waGateway: '' }; }
            );
        },
        updateNotifications: async (data: { emails: string[], waNumber: string, waGateway: string }) => {
            return fetchWithMockFallback(
                async () => {
                    const res = await fetch(`${API_URL}/admin/settings/notifications`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(data)
                    });
                    return handleResponse(res);
                },
                async () => { await delay(200); return { success: true }; }
            );
        }
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
         // Placeholder for update
         return fetchWithMockFallback(
            async () => { return { id, ...data }; },
            async () => { 
                await delay(200); 
                const domains = getStorage<Domain[]>(DB_KEYS.DOMAINS, INITIAL_DOMAINS);
                const idx = domains.findIndex(d => d.id === id);
                if (idx !== -1) {
                    if (data.isPrimary) {
                        domains.forEach(d => d.isPrimary = false);
                    }
                    domains[idx] = { ...domains[idx], ...data };
                    setStorage(DB_KEYS.DOMAINS, domains);
                    return domains[idx];
                }
                return { id, ...data }; 
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

    // CLOUDFLARE INTEGRATION - NO MOCK FALLBACK (Production Requirement)
    tunnels: {
        list: async (): Promise<TunnelRoute[]> => {
            const res = await fetch(`${TUNNEL_API_URL}/routes`);
            return handleResponse(res);
        },
        create: async (hostname: string, service: string) => {
            const res = await fetch(`${TUNNEL_API_URL}/routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostname, service })
            });
            return handleResponse(res);
        },
        edit: async (oldHostname: string, newHostname: string, service: string) => {
             const res = await fetch(`${TUNNEL_API_URL}/routes/edit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostname: oldHostname, newHostname, service })
            });
            return handleResponse(res);
        },
        delete: async (hostname: string) => {
             const res = await fetch(`${TUNNEL_API_URL}/routes`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostname })
            });
            return handleResponse(res);
        }
    },
    // CLOUDFLARE ZONES / DOMAINS - NO MOCK FALLBACK
    cfDomains: {
        list: async () => {
            const res = await fetch(`${TUNNEL_API_URL}/zones`);
            return handleResponse(res);
        },
        getDetails: async (zoneId: string) => {
            const res = await fetch(`${TUNNEL_API_URL}/domains/${zoneId}`);
            return handleResponse(res);
        },
        create: async (domain: string) => {
            const res = await fetch(`${TUNNEL_API_URL}/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain })
            });
            return handleResponse(res);
        },
        delete: async (zoneId: string) => {
            const res = await fetch(`${TUNNEL_API_URL}/domains/${zoneId}`, {
                method: 'DELETE'
            });
            return handleResponse(res);
        }
    },
    // CLOUDFLARE ANALYTICS - NO MOCK FALLBACK
    getTunnelAnalytics: async (limit: number) => {
        const res = await fetch(`${TUNNEL_API_URL}/analytics/domains?hours=24`);
        const result = await handleResponse(res);
        
        // Transform data format if needed, assuming API matches what UI expects
        const mappedData = (result.data || []).map((d: any) => ({
            host: d.domain,
            visits: d.visits
        })).slice(0, limit);
        return { data: mappedData };
    },
    getRevenueAnalytics: async () => {
        await delay(300);
        return []; 
    },

    // APACHE CONFIG MANAGER & HOSTS - NO MOCK FALLBACK
    apache: {
        listSites: async (): Promise<string[]> => {
            const res = await fetch(`${APACHE_API_URL}/sites`);
            return handleResponse(res);
        },
        getSite: async (name: string): Promise<{content: string}> => {
             const res = await fetch(`${APACHE_API_URL}/sites/${name}`);
             return handleResponse(res);
        },
        createSite: async (filename: string, content: string) => {
            const res = await fetch(`${APACHE_API_URL}/sites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content })
            });
            return handleResponse(res);
        },
        updateSite: async (name: string, content: string) => {
             const res = await fetch(`${APACHE_API_URL}/sites/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            return handleResponse(res);
        },
        deleteSite: async (name: string) => {
            const res = await fetch(`${APACHE_API_URL}/sites/${name}`, {
                method: 'DELETE'
            });
            return handleResponse(res);
        },
        getHttpd: async (): Promise<{content: string}> => {
            const res = await fetch(`${APACHE_API_URL}/httpd`);
            return handleResponse(res);
        },
        updateHttpd: async (content: string) => {
             const res = await fetch(`${APACHE_API_URL}/httpd`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            return handleResponse(res);
        },
        // HOSTS FILE MANAGEMENT
        getHosts: async (): Promise<{content: string}> => {
            const res = await fetch(`${APACHE_API_URL}/hosts`);
            return handleResponse(res);
        },
        addHost: async (ip: string, domain: string) => {
            const res = await fetch(`${APACHE_API_URL}/hosts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, domain })
            });
            return handleResponse(res);
        },
        deleteHost: async (domain: string) => {
            const res = await fetch(`${APACHE_API_URL}/hosts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain })
            });
            return handleResponse(res);
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
            async () => { await delay(300); return INITIAL_PLANS; }
        );
    },
    getDomains: async () => {
        return fetchWithMockFallback(
            async () => {
                const res = await fetch(`${API_URL}/domains`);
                return handleResponse(res);
            },
            async () => { await delay(300); return INITIAL_DOMAINS; }
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
                  tickets.push(t);
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
                  if (userId) return tickets.filter(t => t.userId === userId);
                  return tickets; 
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
                  const messages = getStorage<ChatMessage[]>(DB_KEYS.MESSAGES, []);
                  return messages.filter(m => m.ticketId === ticketId); 
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
                  const msg = {
                      id: 'm_' + Date.now(),
                      ticketId,
                      senderId,
                      senderName,
                      text,
                      timestamp: new Date().toISOString(),
                      isAdmin
                  } as ChatMessage;
                  
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
                  if(ticket) {
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
                      plan,
                      amount,
                      method,
                      status: PaymentStatus.PENDING,
                      date: new Date().toISOString(),
                      proofUrl: URL.createObjectURL(proofFile) 
                  } as any);
                  setStorage(DB_KEYS.PAYMENTS, payments);
                  return { success: true }; 
              }
          );
      },
      validateCoupon: async (code: string) => {
          return fetchWithMockFallback(
              async () => {
                  const res = await fetch(`${API_URL}/payments/validate-coupon`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ code })
                  });
                  return handleResponse(res);
              },
              async () => {
                  await delay(500);
                  const discounts = getStorage<DiscountCode[]>(DB_KEYS.DISCOUNTS, []);
                  const discount = discounts.find(d => d.code === code);
                  if (!discount) throw new Error("Invalid coupon code");
                  return discount;
              }
          );
      }
};

export const executeTerminalCommand = async (siteId: string, command: string) => {
      return fetchWithMockFallback(
          async () => {
              const res = await fetch(`${API_URL}/sites/${siteId}/execute`, {
                  method: 'POST',
                  headers: getAuthHeaders(),
                  body: JSON.stringify({ command })
              });
              return handleResponse(res);
          },
          async () => {
              await delay(800);
              return { success: true, output: { stdout: `Mock executed: ${command}\n`, stderr: '', exitCode: 0 } };
          }
      );
};
