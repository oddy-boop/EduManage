import React, { useState } from 'react';
import { UserRole } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Icon } from '../components/Icon';

const ROLES: { role: UserRole; label: string }[] = [
  { role: UserRole.TEACHER, label: 'Teacher' },
  { role: UserRole.ADMIN, label: 'Admin' },
  { role: UserRole.PARENT, label: 'Parent' },
];

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/** Sunrise over layered hills, drawn rather than shipped as a photo. */
const Scene: React.FC = () => (
  <svg
    viewBox="0 0 640 520"
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 w-full h-full"
    aria-hidden
  >
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#fdf6e3" />
        <stop offset="100%" stopColor="#dff1fb" />
      </linearGradient>
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
        <stop offset="60%" stopColor="#fcd34d" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#fcd34d" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
      <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bcd7f5" />
        <stop offset="100%" stopColor="#a9c9ef" />
      </linearGradient>
      <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9dc0ea" />
        <stop offset="100%" stopColor="#88b2e3" />
      </linearGradient>
      <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e8f1fb" />
        <stop offset="100%" stopColor="#cfe3f7" />
      </linearGradient>
      <linearGradient id="river" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#bfdcf5" />
      </linearGradient>
    </defs>

    <rect width="640" height="520" fill="url(#sky)" />
    <circle cx="330" cy="300" r="190" fill="url(#sunGlow)" />
    <circle cx="330" cy="300" r="58" fill="url(#sun)" />

    {/* far ridge */}
    <path d="M0 300 L74 246 L128 282 L196 216 L268 288 L318 258 L392 306 L452 262 L520 300 L590 268 L640 296 L640 520 L0 520 Z" fill="url(#hillFar)" opacity="0.85" />
    {/* mid ridge */}
    <path d="M0 344 L82 300 L162 340 L236 296 L322 348 L404 310 L486 350 L566 314 L640 346 L640 520 L0 520 Z" fill="url(#hillMid)" opacity="0.9" />
    {/* river */}
    <path d="M300 348 C316 396 268 430 286 470 C298 496 268 510 250 520 L420 520 C398 502 372 486 378 458 C386 420 344 392 356 348 Z" fill="url(#river)" />
    {/* near hills */}
    <path d="M0 372 C96 340 168 396 254 372 C300 358 322 400 332 424 L332 520 L0 520 Z" fill="url(#hillNear)" />
    <path d="M640 384 C548 350 470 402 386 378 C344 366 330 404 326 428 L326 520 L640 520 Z" fill="url(#hillNear)" />

    {/* pines */}
    <g fill="#7fa9dd" opacity="0.85">
      <path d="M96 372 l12 26 h-24 z" /><path d="M96 356 l10 22 h-20 z" />
      <path d="M148 384 l10 22 h-20 z" />
      <path d="M498 366 l12 26 h-24 z" /><path d="M498 350 l10 22 h-20 z" />
      <path d="M556 380 l10 22 h-20 z" />
    </g>

    {/* birds */}
    <g stroke="#8fb4e3" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.75">
      <path d="M170 150 q12 -10 24 0" /><path d="M194 150 q12 -10 24 0" />
      <path d="M436 190 q9 -8 18 0" />
    </g>
  </svg>
);

export const Login: React.FC = () => {
  const { localLogin } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.TEACHER);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ id?: boolean; pw?: boolean }>({});

  const usesIdLogin = selectedRole === UserRole.TEACHER || selectedRole === UserRole.PARENT;
  const idLabel = usesIdLogin ? 'Login ID' : 'Email address';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTouched({ id: true, pw: true });
    if (!usernameOrEmail.trim() || !password.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await localLogin(usernameOrEmail.trim(), selectedRole, password, remember);
      if (result.ok === false) setError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const idMissing = touched.id && !usernameOrEmail.trim();
  const pwMissing = touched.pw && !password.trim();

  const fieldWrap = (bad: boolean) =>
    `h-11 rounded-xl flex items-center gap-2.5 px-3.5 transition-all bg-white/12 border ${
      bad ? 'border-rose-300/70' : 'border-white/20 focus-within:border-cyan-300/80 focus-within:bg-white/[0.18]'
    }`;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 sm:p-6 font-display bg-[#cfe9f7]">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#d6f0fb] via-[#cfe4f8] to-[#a7d8ee]" />
      <div className="login-blob login-blob-a" style={{ width: 460, height: 460, background: '#7dd3fc', top: -140, left: -120 }} />
      <div className="login-blob login-blob-b" style={{ width: 420, height: 420, background: '#a5b4fc', bottom: -140, left: '18%' }} />
      <div className="login-blob login-blob-c" style={{ width: 400, height: 400, background: '#67e8f9', top: '18%', right: -120 }} />
      <div className="login-blob login-blob-d" style={{ width: 320, height: 320, background: '#fcd34d', bottom: -100, right: '12%', opacity: 0.3 }} />

      {/* Card */}
      <div className="relative w-full max-w-[940px] rounded-[28px] overflow-hidden bg-white/70 backdrop-blur-xl shadow-[0_40px_90px_-30px_rgba(15,23,42,0.45)] ring-1 ring-white/60 grid md:grid-cols-[1fr_380px]">
        {/* Illustrated panel */}
        <div className="relative min-h-[220px] md:min-h-[540px] overflow-hidden">
          <Scene />
          <div className="relative p-8 sm:p-10">
            <div className="flex items-center gap-2.5 mb-8 md:mb-12">
              <div className="size-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30">
                <Icon name="school" className="text-[19px]" />
              </div>
              <span className="text-[15px] font-bold tracking-[-0.02em] text-slate-800">EduManage</span>
            </div>
            <h1 className="text-[34px] sm:text-[42px] leading-[1.08] font-extrabold tracking-[-0.035em] text-slate-800">
              {greeting()}
            </h1>
            <p className="mt-2.5 text-[15px] text-slate-600/90">Have a great day ahead.</p>
          </div>
        </div>

        {/* Glass form panel */}
        <div className="relative m-0 md:my-6 md:mr-6 md:rounded-3xl overflow-hidden bg-slate-800/70 backdrop-blur-2xl ring-1 ring-white/15 shadow-2xl">
          <div className="p-7 sm:p-8 flex flex-col gap-5">
            <div className="flex gap-1 bg-white/10 p-1 rounded-xl" role="tablist">
              {ROLES.map(({ role, label }) => (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === role}
                  onClick={() => {
                    setSelectedRole(role);
                    setError(null);
                  }}
                  className={`flex-1 text-center text-[12px] py-2 rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                    selectedRole === role ? 'bg-white text-slate-800 font-semibold shadow' : 'text-white/70 font-medium hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor="login-id" className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">
                  {idLabel}
                </label>
                <div className={fieldWrap(!!idMissing)}>
                  <Icon name="person" className="text-[16px] text-white/50" />
                  <input
                    id="login-id"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, id: true }))}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={usesIdLogin ? 'TCH-0417' : 'you@school.edu'}
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] text-white placeholder:text-white/35 outline-none"
                  />
                </div>
                {idMissing && <span className="text-[11px] text-rose-200">Enter your {idLabel.toLowerCase()}.</span>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="login-pw" className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/60">
                  Password
                </label>
                <div className={fieldWrap(!!pwMissing)}>
                  <Icon name="lock" className="text-[16px] text-white/50" />
                  <input
                    id="login-pw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, pw: true }))}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] text-white placeholder:text-white/35 outline-none tracking-[0.14em]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="text-white/50 hover:text-white/80 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                  >
                    <Icon name="visibility" className="text-[16px]" />
                  </button>
                </div>
                {pwMissing && <span className="text-[11px] text-rose-200">Enter your password.</span>}
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <span className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="size-[18px] rounded-[6px] border border-white/30 bg-white/10 peer-checked:bg-cyan-400 peer-checked:border-cyan-400 flex items-center justify-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-300">
                    {remember && <Icon name="check" className="text-[12px] text-slate-900" strokeWidth={3} />}
                  </span>
                </span>
                <span className="text-[12.5px] text-white/80">Keep me signed in</span>
              </label>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/20 ring-1 ring-rose-300/30 px-3.5 py-3" role="alert">
                  <Icon name="priority_high" className="text-[15px] text-rose-200 shrink-0 mt-px" />
                  <p className="text-[11.5px] leading-relaxed text-rose-100">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 rounded-full text-[12.5px] font-bold uppercase tracking-[0.14em] text-white flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 to-primary shadow-lg shadow-cyan-500/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                {isSubmitting ? (
                  <>
                    <Icon name="spinner" className="text-[16px] animate-spin" />
                    Signing in
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="pt-1 flex flex-col gap-1.5">
              <p className="text-[11.5px] text-white/55 leading-relaxed">
                Accounts are created by your school administrator — there is no public sign-up.
              </p>
              <p className="text-[11.5px] text-white/55 leading-relaxed">
                Forgotten your password? Ask an administrator to issue a new one.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
