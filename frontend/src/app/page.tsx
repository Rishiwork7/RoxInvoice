'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Chrome, Phone, Zap, Shield, AlertCircle, Mail, Terminal } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      if (auth) await signInWithPopup(auth, provider);
      router.push('/dashboard');
    } catch (err: unknown) {
      const firebaseError = err as { message?: string };
      setError(firebaseError.message || 'Failed to sign in with Google.');
      setLoadingGoogle(false);
    }
  };

  const handlePhoneSignIn = async () => {
    setLoadingPhone(true);
    setError('');
    // Phone auth requires reCAPTCHA setup — placeholder UI
    setTimeout(() => {
      setError('Phone authentication requires additional setup. Please use Google Sign-In.');
      setLoadingPhone(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Aggressive Dark Background */}
      <div className="fixed inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      <div className="fixed top-[-20%] right-[-10%] w-[800px] h-[800px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-20%] w-[600px] h-[600px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Top bar */}
      <nav className="flex items-center justify-between px-6 lg:px-12 py-6 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-xl relative z-50">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">RoxInvoice</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleGoogleSignIn} disabled={loadingGoogle} className="px-6 py-2.5 bg-white text-black text-sm font-bold rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            {loadingGoogle ? 'INITIALIZING...' : 'ACCESS SYSTEM'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 w-full max-w-7xl mx-auto py-20 lg:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center w-full">
          {/* Left Side: RoxInvoice Copy */}
          <div className="space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Intelligent Transmission Engine
            </div>
            <h1 className="text-5xl lg:text-7xl font-black text-white leading-[1.05] tracking-tighter">
              BULLSEYE DELIVERY. <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient-x">MASS INVOICING.</span>
            </h1>
            Transform your billing workflow with RoxInvoice. Upload target matrices, configure rich HTML payloads, and unleash high-velocity, personalized invoice distribution through distributed SMTP nodes.

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-4">
              <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center"><Chrome className="w-5 h-5 text-indigo-400" /></div>
                <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center"><Mail className="w-5 h-5 text-emerald-400" /></div>
                <div className="w-10 h-10 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center"><Shield className="w-5 h-5 text-rose-400" /></div>
              </div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest"><span className="text-white font-black">ENTERPRISE GRADE</span> ARCHITECTURE</p>
            </div>
          </div>

          {/* Right Side: Dark Glassmorphic Card */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-x-0 -top-4 -bottom-4 bg-gradient-to-b from-indigo-500/20 to-purple-500/20 rounded-[40px] blur-2xl opacity-50 animate-pulse" />

            <div className="bg-[#121214]/80 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-2xl border border-zinc-800/80 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="text-center mb-8 relative z-10">
                <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Terminal className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">AUTHENTICATE</h2>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Establish secure connection</p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <div className="space-y-4 relative z-10">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loadingGoogle}
                  className="w-full flex items-center justify-center gap-3 bg-white text-black font-black py-4 px-6 rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98]"
                >
                  {loadingGoogle ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Chrome className="w-5 h-5" />}
                  <span>OAUTH GOOGLE</span>
                </button>

                <button
                  onClick={handlePhoneSignIn}
                  disabled={loadingPhone}
                  className="w-full flex items-center justify-center gap-3 bg-zinc-900 border border-zinc-800 text-white font-bold py-4 px-6 rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  <Phone className="w-5 h-5 text-zinc-400" />
                  <span>SECURE OTP SMS</span>
                </button>
              </div>

              <div className="mt-8 text-center relative z-10">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
                  Transmission Logs Encrypted <br /><span className="text-indigo-500/50">E2EE Protocol Active</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-zinc-800/50 bg-[#09090b] relative z-10 text-center sm:text-left">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">© {new Date().getFullYear()} ROXINVOICE. <span className="text-emerald-500">SYSTEM NOMINAL.</span></p>
          <div className="flex gap-6 uppercase tracking-widest text-[10px] font-bold">
            <span className="text-zinc-600 hover:text-white cursor-pointer transition-colors">TOS</span>
            <span className="text-zinc-600 hover:text-white cursor-pointer transition-colors">SEC OPS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
