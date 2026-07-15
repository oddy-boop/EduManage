import React, { useState } from 'react';
import { UserRole } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/AuthContext';

interface LoginProps {
  onLogin: (role: UserRole) => void;
}

export const Login: React.FC<LoginProps> = () => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.TEACHER);
  const { localLogin } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) {
      alert("Please fill in all credentials.");
      return;
    }

    if (selectedRole === UserRole.ADMIN && !password.trim()) {
      alert("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await localLogin(usernameOrEmail.trim(), selectedRole, password);
      if (!success) {
        console.warn("Initializing default mock dashboard view for role selection.");
      }
    } catch (err) {
      console.error("Authentication server query failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isIdOnlyLogin = selectedRole === UserRole.TEACHER || selectedRole === UserRole.PARENT;

  return (
    <div className="min-h-screen flex flex-col font-display relative overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-white">
      {/* Background abstract decorations */}
      <div className="absolute inset-0 z-0 opacity-30 dark:opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] size-96 rounded-full bg-primary/20 blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] size-96 rounded-full bg-indigo-500/20 blur-3xl"></div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-lg">
          {/* Glassmorphic Card Container */}
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-primary/10 rounded-3xl overflow-hidden border border-white/20 dark:border-slate-800/80 transition-all duration-300">
            
            {/* Header Block */}
            <div className="pt-12 pb-6 px-10 text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="bg-gradient-to-tr from-primary to-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-primary/30 flex items-center justify-center">
                  <Icon name="school" className="text-3xl" />
                </div>
                <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent dark:from-white dark:to-slate-400">
                  EduManage
                </h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold tracking-wide uppercase text-xs">Unified School Portal</p>
            </div>

            {/* Role Selectors Tabs */}
            <div className="px-10 pb-6">
              <div className="flex h-14 w-full items-center justify-between rounded-2xl bg-slate-100/80 dark:bg-slate-800/50 p-1.5 border border-slate-200/50 dark:border-slate-700/30">
                {[UserRole.TEACHER, UserRole.ADMIN, UserRole.PARENT].map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(role);
                      setUsernameOrEmail('');
                      setPassword('');
                    }}
                    className={`flex h-full grow items-center justify-center overflow-hidden rounded-xl px-4 transition-all duration-300 text-sm font-bold ${
                      selectedRole === role 
                        ? 'bg-white dark:bg-slate-700 shadow-md text-primary dark:text-white scale-[1.02]' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Login Form */}
            <form className="px-10 pb-10 space-y-6" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <label className="text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider px-1">
                  {isIdOnlyLogin ? `${selectedRole} ID Number` : 'Email Address'}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                    <Icon name={isIdOnlyLogin ? "badge" : "person"} className="text-lg" />
                  </div>
                  <input 
                    type="text" 
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400/80 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none border font-medium text-sm"
                    placeholder={isIdOnlyLogin ? `Enter your ${selectedRole.toLowerCase()} ID` : "e.g. admin@school.edu"}
                    required
                  />
                </div>
                {isIdOnlyLogin && (
                  <p className="text-[10px] text-slate-400 font-medium px-1">
                    Use your generated ID credential to access your dashboard directly.
                  </p>
                )}
              </div>

              {!isIdOnlyLogin && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">Password</label>
                    <a href="#" className="text-primary text-xs font-semibold hover:underline">Forgot?</a>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                      <Icon name="lock" className="text-lg" />
                    </div>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400/80 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none border font-medium text-sm"
                      placeholder="••••••••"
                      required={!isIdOnlyLogin}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="remember" className="w-4 h-4 text-primary bg-slate-100 border-slate-300 rounded focus:ring-primary focus:ring-2 cursor-pointer" />
                  <label htmlFor="remember" className="text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">Remember me</label>
                </div>
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                disabled={isSubmitting}
              >
                <span>{isIdOnlyLogin ? 'Access Portal' : 'Login to Dashboard'}</span>
                <Icon name="arrow_forward" className="text-xl" />
              </button>

              <div className="text-center pt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Request access credentials from the <button type="button" onClick={() => setShowHelpModal(true)} className="text-primary font-bold hover:underline">Principal's Office</button>.
                </p>
              </div>
            </form>

            {/* Footer status line */}
            <div className="bg-slate-50/80 dark:bg-slate-800/30 py-4.5 px-10 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider text-[9px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Database Server Connected
              </div>
              <a href="#" className="text-slate-400 hover:text-primary transition-colors flex items-center gap-1 text-[11px] font-bold">
                <Icon name="support_agent" className="text-sm" />
                IT Helpdesk
              </a>
            </div>

          </div>
        </div>
      </div>

      {/* Demo Credentials Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Icon name="info" className="text-primary" /> Principal's Office
                </h3>
                <p className="text-xs text-slate-500 mt-1">How to get access to the school portal.</p>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="size-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <p className="text-xs font-bold text-primary uppercase mb-2">Administrators</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  Sign in with your school email and password. Contact your system administrator if you don't have an account yet.
                </p>
              </div>

              <div className="p-4 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-2">Teachers & Parents</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  These portals use your assigned ID number. The Admin issues this ID when your record is created under <span className="font-bold text-slate-700 dark:text-slate-300">Registration</span> — check with the school office if you don't have yours.
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setShowHelpModal(false)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold mt-6 transition-all text-sm"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
