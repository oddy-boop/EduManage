import React, { useState } from 'react';
import { UserRole } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/AuthContext';

export const Login: React.FC = () => {
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

    if (!password.trim()) {
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

  const usesIdLogin = selectedRole === UserRole.TEACHER || selectedRole === UserRole.PARENT;

  // This page intentionally always renders dark/immersive, independent of the app's internal
  // light/dark theme (which only applies once a user is signed in) — it's a fixed brand moment.
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#08070f] font-display text-white">
      {/* Animated gradient-mesh background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="login-blob login-blob-a size-[380px] -top-24 -left-24 bg-indigo-600"></div>
        <div className="login-blob login-blob-b size-[320px] -top-16 right-[5%] bg-cyan-400"></div>
        <div className="login-blob login-blob-c size-[360px] -bottom-36 left-[20%] bg-purple-500"></div>
        <div className="login-blob login-blob-d size-[260px] -bottom-10 right-[10%] bg-indigo-700"></div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Brand mark */}
        <div className="w-full max-w-6xl mx-auto flex items-center gap-2.5 px-6 pt-8 sm:px-12">
          <div className="size-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
            <Icon name="school" className="text-lg" />
          </div>
          <span className="font-black tracking-tight">EduManage</span>
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-16 px-6 py-10 sm:px-12">
            {/* Hero copy — hidden on smaller screens, this is a desktop-first brand moment */}
            <div className="hidden lg:block max-w-sm shrink-0">
              <h1 className="text-5xl font-black leading-[1.05] tracking-tight mb-5">
                One portal.<br />Every classroom.
              </h1>
              <p className="text-white/55 text-sm leading-relaxed mb-8 max-w-xs">
                Attendance, fees, report cards, and quizzes — for teachers, parents, and admins, all in one place.
              </p>
              <div className="flex gap-8">
                <div>
                  <p className="text-2xl font-black">3</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Portals</p>
                </div>
                <div>
                  <p className="text-2xl font-black">Live</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Sync</p>
                </div>
                <div>
                  <p className="text-2xl font-black">Secure</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">By design</p>
                </div>
              </div>
            </div>

            {/* Glassmorphic login card */}
            <div className="w-full max-w-md shrink-0 mx-auto lg:mx-0">
              <div className="bg-white/[0.07] backdrop-blur-2xl shadow-2xl shadow-black/40 rounded-3xl overflow-hidden border border-white/15">

              <div className="pt-10 pb-2 px-8 text-center lg:hidden">
                <h1 className="text-2xl font-black tracking-tight">EduManage</h1>
                <p className="text-white/45 text-[11px] font-bold uppercase tracking-wider mt-1">Unified School Portal</p>
              </div>

              <div className="pt-8 px-8">
                <h2 className="text-xl font-bold">Welcome back</h2>
                <p className="text-white/45 text-xs mt-1">Sign in to continue to your dashboard</p>
              </div>

              {/* Role Selector Tabs */}
              <div className="px-8 pt-6">
                <div className="flex h-12 w-full items-center justify-between rounded-xl bg-white/5 p-1 border border-white/10">
                  {[UserRole.TEACHER, UserRole.ADMIN, UserRole.PARENT].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setSelectedRole(role);
                        setUsernameOrEmail('');
                        setPassword('');
                      }}
                      className={`flex h-full grow items-center justify-center overflow-hidden rounded-lg px-3 transition-all duration-300 text-xs font-bold ${
                        selectedRole === role
                          ? 'bg-white text-slate-900 shadow-md'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Login Form */}
              <form className="px-8 pb-8 pt-6 space-y-5" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                  <label className="text-white/45 text-[10px] font-bold uppercase tracking-wider px-1">
                    {usesIdLogin ? `${selectedRole} ID Number` : 'Email Address'}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-white/35 group-focus-within:text-cyan-300 transition-colors">
                      <Icon name={usesIdLogin ? "badge" : "person"} className="text-lg" />
                    </div>
                    <input
                      type="text"
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-white/[0.06] border border-white/15 rounded-xl text-white placeholder:text-white/30 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400/50 transition-all outline-none font-medium text-sm"
                      placeholder={usesIdLogin ? `Enter your ${selectedRole.toLowerCase()} ID` : "e.g. admin@school.edu"}
                      required
                    />
                  </div>
                  {usesIdLogin && (
                    <p className="text-[10px] text-white/35 font-medium px-1">
                      Use the ID your school administrator issued you.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-white/45 text-[10px] font-bold uppercase tracking-wider">Password</label>
                    <button type="button" onClick={() => setShowHelpModal(true)} className="text-cyan-300 text-xs font-semibold hover:underline">Forgot?</button>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-white/35 group-focus-within:text-cyan-300 transition-colors">
                      <Icon name="lock" className="text-lg" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-white/[0.06] border border-white/15 rounded-xl text-white placeholder:text-white/30 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400/50 transition-all outline-none font-medium text-sm"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-500 to-cyan-400 hover:from-indigo-400 hover:to-cyan-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                  disabled={isSubmitting}
                >
                  <span>{usesIdLogin ? 'Access Portal' : 'Login to Dashboard'}</span>
                  <Icon name="arrow_forward" className="text-xl" />
                </button>

                <div className="text-center pt-1">
                  <p className="text-xs text-white/40">
                    Request access credentials from the <button type="button" onClick={() => setShowHelpModal(true)} className="text-cyan-300 font-bold hover:underline">Principal's Office</button>.
                  </p>
                </div>
              </form>

              {/* Footer status line */}
              <div className="bg-white/[0.03] py-4 px-8 border-t border-white/10 flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 uppercase tracking-wider text-[9px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Database Server Connected
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(true)}
                  className="text-white/40 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[11px] font-bold"
                >
                  <Icon name="support_agent" className="text-sm" />
                  IT Helpdesk
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Demo Credentials Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12101f] rounded-2xl shadow-2xl max-w-md w-full p-8 border border-white/10 animate-in fade-in zoom-in-95 duration-150 text-white">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Icon name="info" className="text-cyan-300" /> Principal's Office
                </h3>
                <p className="text-xs text-white/45 mt-1">How to get access to the school portal.</p>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="size-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-cyan-400/5 rounded-xl border border-cyan-400/10">
                <p className="text-xs font-bold text-cyan-300 uppercase mb-2">Administrators</p>
                <p className="text-xs text-white/60 leading-relaxed font-medium">
                  Sign in with your school email and password. Contact your system administrator if you don't have an account yet.
                </p>
              </div>

              <div className="p-4 bg-indigo-400/5 rounded-xl border border-indigo-400/10">
                <p className="text-xs font-bold text-indigo-300 uppercase mb-2">Teachers & Parents</p>
                <p className="text-xs text-white/55 leading-relaxed font-medium">
                  Sign in with the ID number and password your Admin issued you when your record was created under <span className="font-bold text-white/80">Registration</span>.
                </p>
              </div>

              <div className="p-4 bg-amber-400/5 rounded-xl border border-amber-400/10">
                <p className="text-xs font-bold text-amber-300 uppercase mb-2">Forgot Your Password?</p>
                <p className="text-xs text-white/55 leading-relaxed font-medium">
                  Passwords can only be reset by your school Admin from the Registration directory. Contact the school office to have yours reset.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-3 bg-white hover:bg-white/90 text-slate-900 rounded-xl font-bold mt-6 transition-all text-sm"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
