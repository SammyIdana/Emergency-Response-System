import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Siren, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-zinc-900 flex-col justify-between p-12 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, #f97316 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="absolute bottom-0 left-0 right-0 h-1/2"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(249,115,22,0.15), transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
              <Siren size={20} className="text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-zinc-100">GH Emergency Response</p>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">National Platform</p>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="font-display text-5xl font-bold text-zinc-100 leading-tight mb-4">
            Coordinating<br />
            <span className="text-gradient">rapid response</span><br />
            across Ghana.
          </h1>
          <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
            A distributed platform for real-time emergency dispatch, fleet tracking, and incident analytics — built for Ghana's national emergency services.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { label: 'Services',   value: '4'    },
            { label: 'Regions',    value: '16'   },
            { label: 'Uptime',     value: '99.9%'},
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="font-display text-2xl font-bold text-orange-400">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Siren size={16} className="text-white" />
            </div>
            <p className="font-display font-bold text-zinc-100">GH Emergency Response</p>
          </div>

          <h2 className="font-display text-3xl font-bold text-zinc-100 mb-1">Sign in</h2>
          <p className="text-zinc-500 text-sm mb-8">Enter your admin credentials to continue</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="admin@erp.gh"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-zinc-600 text-center">
            CPEN 421 — Emergency Response Platform · Phase 3
          </p>
        </div>
      </div>
    </div>
  );
}
