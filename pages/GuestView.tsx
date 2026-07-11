
import React from 'react';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/AuthContext';

export const GuestView: React.FC = () => {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 p-10 text-center">
        <div className="size-20 bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto mb-8 shadow-inner">
          <Icon name="pending" className="text-4xl" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Pending</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-10 leading-relaxed">
          Hello, <span className="font-semibold text-slate-900 dark:text-slate-200">{user?.name}</span>. 
          Your account is registered but hasn't been assigned a specific role yet. 
          Please contact your administrator to grant you access to the School Portal.
        </p>

        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 flex items-center gap-3 text-left">
            <div className="size-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700 shadow-sm">
              <Icon name="mail" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Registered Email</p>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{user?.email}</p>
            </div>
          </div>

          <button 
            onClick={signOut}
            className="w-full py-4 text-sm font-bold text-slate-500 hover:text-rose-600 transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="logout" className="text-lg" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
