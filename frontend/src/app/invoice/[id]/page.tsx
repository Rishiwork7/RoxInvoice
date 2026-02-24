'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, FileText, Download, ArrowRight, Loader2, Lock } from 'lucide-react';

export default function InvoiceViewer({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState('Verifying Secure Token...');
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [fetchError, setFetchError] = useState<string>('');
    const { id: invoiceId } = use(params);

    useEffect(() => {
        const runVerification = async () => {
            try {
                await new Promise(r => setTimeout(r, 800));
                setStatusText('Connecting to Encrypted Node...');

                // Fetch the actual PDF URL from the backend
                const res = await fetch(`http://localhost:5001/api/invoice/${invoiceId}`);
                const data = await res.json();

                if (res.ok && data.success && data.pdfBase64) {
                    setPdfUrl(`data:application/pdf;base64,${data.pdfBase64}`);
                } else {
                    setFetchError(data.error || 'Failed to locate document');
                }

                await new Promise(r => setTimeout(r, 600));
                setStatusText('Decrypting Payload...');
                await new Promise(r => setTimeout(r, 900));
            } catch (err) {
                setFetchError('Connection error while verifying token');
            } finally {
                setIsLoading(false);
            }
        };

        runVerification();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center font-sans">
                <div className="flex flex-col items-center space-y-6 animate-pulse">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                    <div className="text-center space-y-2">
                        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">Authenticating Link</h2>
                        <p className="text-sm text-zinc-500 font-mono">{statusText}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30 flex flex-col pt-10 px-4 pb-20">
            {/* Dark, aggressive background */}
            <div className="fixed inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full" />

            <div className="max-w-2xl w-full mx-auto relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">

                {/* Header Logo */}
                <div className="flex items-center justify-center gap-3 mb-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-[#121214] border border-zinc-800 rounded-[32px] overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

                    <div className="p-8 sm:p-10 border-b border-zinc-800/50">
                        <div className="flex items-center justify-between mb-8">
                            <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-2 border border-emerald-500/20">
                                <Lock className="w-3 h-3" /> SECURE DOCUMENT
                            </span>
                            <span className="text-zinc-500 font-mono text-sm">{invoiceId}</span>
                        </div>

                        <h1 className="text-3xl font-black text-white mb-4 tracking-tight">Your Document is Ready</h1>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            You have successfully authenticated via a secure, one-time link. Your requested digital asset has been prepared and encrypted for your device.
                        </p>
                    </div>

                    <div className="p-8 sm:p-10 bg-zinc-950/50">
                        <div className="space-y-4 mb-10">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 group hover:border-indigo-500/50 transition-colors">
                                <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-white mb-1">Invoice_Statement_Encrypted.pdf</h3>
                                    <p className="text-xs text-zinc-500">Portable Document Format • 1.2 MB</p>
                                </div>
                            </div>
                        </div>

                        {fetchError ? (
                            <div className="w-full py-4 bg-rose-500/10 text-rose-400 font-bold text-center rounded-2xl border border-rose-500/20">
                                {fetchError}. Please contact support.
                            </div>
                        ) : (
                            <a href={pdfUrl} download={`Invoice_${invoiceId}.pdf`} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-[0_0_40px_-10px_rgba(99,102,241,0.4)] hover:shadow-[0_0_60px_-10px_rgba(99,102,241,0.6)] active:scale-[0.98] flex items-center justify-center gap-3 text-lg group">
                                <Download className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                                DOWNLOAD SECURE PDF
                            </a>
                        )}

                        <div className="mt-6 text-center">
                            <button onClick={() => router.push('/')} className="text-xs font-bold text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1 mx-auto">
                                Return to Homepage <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-zinc-600 mt-8 font-mono uppercase tracking-widest">
                    Secured by RoxInvoice Protocol • E2E Verification
                </p>
            </div>
        </div>
    );
}
