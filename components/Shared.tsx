import React from 'react';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => (
  <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300 ${className}`}>
    {(title || action) && (
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
        {title && <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>}
        {action && <div>{action}</div>}
      </div>
    )}
    {children && (
      <div className="p-6 text-slate-700 dark:text-slate-300">
        {children}
      </div>
    )}
  </div>
);

interface BadgeProps {
  status: string;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status }) => {
  let colors = 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'; // Default
  
  switch (status) {
    case 'ACTIVE':
    case 'VERIFIED':
      colors = 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      break;
    case 'OPEN':
      colors = 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      break;
    case 'PENDING':
    case 'DEPLOYING':
      colors = 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      break;
    case 'SUSPENDED':
    case 'REJECTED':
    case 'FAILED':
      colors = 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
      break;
    case 'CLOSED':
      colors = 'bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700';
      break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${colors}`}>
      {status}
    </span>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend, trendUp }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors duration-300">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      {trend && (
        <div className={`text-xs font-medium ${trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trendUp ? '+' : ''}{trend}
        </div>
      )}
    </div>
  </div>
);