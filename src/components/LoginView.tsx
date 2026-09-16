import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Scale, ShieldCheck, UserRound } from 'lucide-react';
import { UserRole } from '../types/compliance';

interface LoginViewProps {
  onLogin: (role: UserRole) => void;
}

const roles: Array<{ id: UserRole; label: string; detail: string; icon: typeof UserRound }> = [
  { id: 'INSPECTOR', label: 'Field inspector', detail: 'Capture evidence and run inspections', icon: UserRound },
  { id: 'CONTROLLER', label: 'Supervisor', detail: 'Review findings and authorize action', icon: ShieldCheck },
];

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>('INSPECTOR');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.trim().length < 4) {
      setError('Enter your access code to continue.');
      return;
    }
    onLogin(role);
  };

  return (
    <main className="login-page min-h-screen grid lg:grid-cols-[1.08fr_.92fr] bg-[#f7f4ed] text-[#171717]">
      <section className="login-visual relative overflow-hidden min-h-[360px] lg:min-h-screen p-7 sm:p-12 lg:p-16 flex flex-col justify-between text-[#fffcf6]">
        <div className="login-visual-image absolute inset-0" aria-hidden="true" />
        <div className="login-grid absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="brand-mark w-10 h-10 bg-[#e4572e] rounded-xl flex items-center justify-center"><Scale className="w-5 h-5" /></div>
          <div><div className="font-bold tracking-tight">Metrology Desk</div><div className="text-[10px] font-mono tracking-[.16em] text-white/60">INSPECTION OS / 01</div></div>
        </div>
        <div className="relative z-10 max-w-xl py-14 lg:py-0">
          <div className="text-[10px] font-mono tracking-[.22em] text-[#f7d8ce] mb-5">A DEFENSIBLE RECORD STARTS HERE</div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-[-.06em] leading-[.95]">Measure what matters.<br /><span className="text-[#f7d8ce]">Prove the rest.</span></h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">An evidence-first workspace for packaged commodity inspections, built for the people responsible for getting the details right.</p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-x-8 gap-y-3 text-[10px] font-mono tracking-[.12em] text-white/55 uppercase"><span>AI vision</span><span>Evidence chain</span><span>LM / USP ready</span></div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-[430px]">
          <div className="mb-10"><div className="text-[10px] font-mono tracking-[.2em] text-[#b38a3e] mb-3">SECURE WORKSPACE ACCESS</div><h2 className="text-3xl sm:text-4xl font-bold tracking-[-.04em]">Welcome back.</h2><p className="mt-2 text-sm text-[#77746d]">Choose your role to open the inspection desk.</p></div>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-2">
              {roles.map(({ id, label, detail, icon: Icon }) => <button type="button" key={id} onClick={() => { setRole(id); setError(''); }} className={`login-role text-left p-4 border transition-all ${role === id ? 'border-[#e4572e] bg-[#fff7f2] shadow-[inset_3px_0_0_#e4572e]' : 'border-[#d8d3c8] bg-[#fffcf6] hover:border-[#b38a3e]'}`}><Icon className={`w-5 h-5 mb-5 ${role === id ? 'text-[#e4572e]' : 'text-[#77746d]'}`} /><span className="block text-sm font-bold">{label}</span><span className="block text-[11px] leading-relaxed text-[#77746d] mt-1">{detail}</span></button>)}
            </div>
            <label className="block"><span className="block text-[10px] font-mono tracking-[.14em] text-[#77746d] mb-2">ACCESS CODE</span><span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9b978e]" /><input autoFocus value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} type={showPassword ? 'text' : 'password'} placeholder="Enter access code" className="w-full h-12 pl-10 pr-11 border border-[#d8d3c8] bg-[#fffcf6] focus:border-[#e4572e] outline-none text-sm" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#77746d] hover:text-[#171717]" aria-label={showPassword ? 'Hide access code' : 'Show access code'}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></span></label>
            {error && <p className="text-xs text-[#b93832]" role="alert">{error}</p>}
            <button type="submit" className="login-submit w-full h-12 px-5 bg-[#171717] hover:bg-[#e4572e] text-white text-sm font-bold flex items-center justify-between group">Open inspection desk <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></button>
          </form>
          <div className="mt-8 pt-5 border-t border-[#d8d3c8] flex items-center justify-between text-[10px] font-mono text-[#9b978e]"><span>SESSION / ENCRYPTED</span><span>v2.4.1</span></div>
        </div>
      </section>
    </main>
  );
};
