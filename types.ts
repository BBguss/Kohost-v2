
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum SiteStatus {
  ACTIVE = 'ACTIVE',
  DEPLOYING = 'DEPLOYING',
  SUSPENDED = 'SUSPENDED',
  FAILED = 'FAILED',
  DB_ONLY = 'DB_ONLY' // Indicates web files are deleted but DB is preserved
}

export enum Framework {
  LARAVEL = 'Laravel',
  NEXTJS = 'Next.js',
  REACT = 'React',
  NODEJS = 'Node.js',
  PHP = 'PHP Native',
  HTML = 'HTML Static'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

export enum PlanType {
  BASIC = 'Basic',
  PRO = 'Pro',
  PREMIUM = 'Premium'
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  plan: string; // Changed from PlanType to string to support dynamic plans
  avatar?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  planExpiresAt?: string;
  theme?: 'light' | 'dark';
}

export interface Site {
  id: string;
  userId: string;
  name: string;
  subdomain: string;
  framework: Framework;
  status: SiteStatus;
  createdAt: string;
  storageUsed: number; // in MB
  hasDatabase?: boolean; // New field to track database requirement
}

export interface Payment {
  id: string;
  userId: string;
  username: string; // denormalized for easy display
  amount: number;
  plan: string;
  method: 'BANK' | 'QR';
  status: PaymentStatus;
  date: string;
  proofUrl: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  username: string; // denormalized
  subject: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isAdmin: boolean;
}

export interface Domain {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface HostingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  limits: {
    sites: number;
    storage: number; // in MB
    databases: number;
  };
  isPopular?: boolean;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: string;
  path: string; // The directory path this file belongs to (e.g., "/" or "/src")
  content?: string; // Mock content for download
  createdAt: string;
}

export type SiteFileSystem = Record<string, FileNode[]>;

export interface TerminalAction {
  id: string;
  label: string;
  command: string; // The actual command executed on server
  description: string;
  isDangerous?: boolean;
  executionMode?: 'ssh' | 'local'; // Where the command is executed
}

export interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'error' | 'success' | 'command';
}

export interface DiscountCode {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  validPlans: string[];
}

export interface TunnelRoute {
  hostname: string;
  service: string;
}

export interface Notification {
  id: string;
  userId: string; // Can be specific User ID or 'ADMIN' for all admins
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  createdAt: string;
  link?: string; // Optional internal link (e.g., 'BILLING')
}
