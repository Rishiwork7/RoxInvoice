'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from 'recharts';
import {
    Upload, Mail, Eye, Send, Terminal, LogOut,
    DollarSign, Server, Trash2, Users, Layers, Zap, ShieldCheck,
    ChevronRight, ChevronLeft, CheckCircle, Loader2
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

// Dynamically import react-quill-new to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), {
    ssr: false,
    loading: () => (
        <div className="h-48 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});
import 'react-quill-new/dist/quill.snow.css';

interface Sender { email: string; appPassword: string }
interface CsvRow { Name: string; Email: string;[key: string]: string }
interface InvoiceDetails {
    logoUrl: string;
    productName: string;
    productDescription: string;
    itemPrice: string;
    itemQuantity: string;
}
interface DispatchStatus {
    completed: number;
    failed: number;
    totalSales: number;
    logs: { timestamp: number, status: 'completed' | 'failed', email: string, message: string }[];
}



const PIE_COLORS = ['#818cf8', '#fb7185']; // Lighter indigo and rose for dark bg

const STEPS = [
    { id: 1, label: 'Setup', icon: Users },
    { id: 2, label: 'Compose', icon: Layers },
    { id: 3, label: 'Send', icon: Send },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { user } = useAuth();
    const router = useRouter();

    // App mode
    const [appMode, setAppMode] = useState<'setup' | 'dispatching'>('setup');
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: Sender Pool
    const [senderPool, setSenderPool] = useState<Sender[]>([]);
    const [newSenderEmail, setNewSenderEmail] = useState('');
    const [newSenderPassword, setNewSenderPassword] = useState('');
    const [newSenderError, setNewSenderError] = useState('');

    // Step 2: Data Upload
    const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [manualName, setManualName] = useState('');
    const [manualEmail, setManualEmail] = useState('');
    const [manualEmailError, setManualEmailError] = useState('');

    // Step 3: Invoice Details
    const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails>({
        logoUrl: '',
        productName: '',
        productDescription: '',
        itemPrice: '',
        itemQuantity: '',
    });

    // Step 4: Mail Composer
    const [emailSubject, setEmailSubject] = useState('[Action Required] Your {invoice|bill|receipt} #{{Invoice_Number}} is {ready|available|generated}');
    const [emailBody, setEmailBody] = useState('<p>{Hi|Hello|Greetings|Dear} {{Name}},</p><p>{We hope you are doing well.|Hope you are having a great day.|Thank you for your business.} This is an automated notification that your {latest|monthly|recent} {invoice|bill|statement} for your recent purchase is {attached below|ready for your review|now available}.</p><p>Please click the button below to {view|download|access} your secure document.</p><p>{Best regards|Sincerely|Thank you},<br/>The Billing Team</p>');
    const [deliveryMethod, setDeliveryMethod] = useState<'attachment' | 'link'>('attachment');
    const [previewMode, setPreviewMode] = useState<'email' | 'pdf'>('email');
    const [pdfPreviewData, setPdfPreviewData] = useState<string>('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [senderName, setSenderName] = useState('Invoice Dispatch');

    // Step 5: Review & Send / Dispatching
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus>({
        completed: 0, failed: 0, totalSales: 0, logs: [],
    });
    const [liveLogs, setLiveLogs] = useState<any[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll terminal
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [liveLogs]);

    // Poll dispatch status
    useEffect(() => {
        if (appMode !== 'dispatching') return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch('http://localhost:5001/api/dispatch-status');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setDispatchStatus({
                            completed: data.counts.completed,
                            failed: data.counts.failed,
                            totalSales: data.totalSales,
                            logs: data.logs
                        });
                        setLiveLogs(data.liveLogs || []);
                    }
                }
            } catch {
                // Backend might not be running in dev
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [appMode]);

    // Form persistence to localStorage
    useEffect(() => {
        try {
            const savedInvoice = localStorage.getItem('invoiceDetails');
            if (savedInvoice) setInvoiceDetails(JSON.parse(savedInvoice));

            const savedSubject = localStorage.getItem('emailSubject');
            if (savedSubject) setEmailSubject(savedSubject);

            const savedBody = localStorage.getItem('emailBody');
            if (savedBody) setEmailBody(savedBody);

            const savedSenderName = localStorage.getItem('senderName');
            if (savedSenderName) setSenderName(savedSenderName);

            const savedSenderPool = localStorage.getItem('senderPool');
            if (savedSenderPool) setSenderPool(JSON.parse(savedSenderPool));

            const savedDelivery = localStorage.getItem('deliveryMethod');
            if (savedDelivery) setDeliveryMethod(savedDelivery as 'attachment' | 'link');
        } catch (e) {
            console.error('Failed to load saved dashboard state', e);
        }
    }, []);

    useEffect(() => {
        if (invoiceDetails.productName) localStorage.setItem('invoiceDetails', JSON.stringify(invoiceDetails));
    }, [invoiceDetails]);

    useEffect(() => {
        if (emailSubject) localStorage.setItem('emailSubject', emailSubject);
    }, [emailSubject]);

    useEffect(() => {
        if (emailBody) localStorage.setItem('emailBody', emailBody);
    }, [emailBody]);

    useEffect(() => {
        if (senderName) localStorage.setItem('senderName', senderName);
    }, [senderName]);

    useEffect(() => {
        if (senderPool.length > 0) localStorage.setItem('senderPool', JSON.stringify(senderPool));
    }, [senderPool]);

    useEffect(() => {
        if (deliveryMethod) localStorage.setItem('deliveryMethod', deliveryMethod);
    }, [deliveryMethod]);

    useEffect(() => {
        const fetchPdfPreview = async () => {
            if (previewMode !== 'pdf') return;
            setIsGeneratingPdf(true);
            try {
                const res = await fetch('http://localhost:5001/api/preview-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        invoiceDetails,
                        recipient: csvRows[0] || { Name: 'Dummy Client', Email: 'dummy@example.com' }
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.pdfBase64) {
                        // Decode base64 to binary string
                        const binaryString = window.atob(data.pdfBase64);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }

                        // Create a Blob and Object URL for the iframe
                        const blob = new Blob([bytes], { type: 'application/pdf' });
                        const blobUrl = URL.createObjectURL(blob);

                        // Clean up old object URL if exists
                        setPdfPreviewData(prevData => {
                            if (prevData && prevData.startsWith('blob:')) {
                                URL.revokeObjectURL(prevData);
                            }
                            return blobUrl;
                        });
                    }
                }
            } catch (e) {
                console.error('Failed to gen PDF preview', e);
            } finally {
                setIsGeneratingPdf(false);
            }
        };

        const timeoutId = setTimeout(fetchPdfPreview, 800); // Debounce
        return () => clearTimeout(timeoutId);
    }, [previewMode, invoiceDetails, csvRows]);

    // ─── Handlers ───────────────────────────────────────────────────────────────
    const parseCsv = (file: File) => {
        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: (header) => header.trim(),
            complete: (results) => {
                if (!results.data || results.data.length === 0) return;

                // Identify which column is most likely "Name" and "Email"
                const keys = Object.keys(results.data[0]);
                const emailKey = keys.find(k => {
                    const low = k.toLowerCase();
                    return low.includes('email') || low.includes('e-mail') || low.includes('mail');
                }) || keys[0]; // fallback to first column

                const nameKey = keys.find(k => {
                    const low = k.toLowerCase();
                    return low.includes('name') || low.includes('customer') || low.includes('client') || low.includes('user');
                }) || keys[1] || keys[0]; // fallback to second or first

                const normalizedRows = results.data
                    .filter(row => row[emailKey] && row[emailKey].toString().trim() !== '')
                    .map(row => ({
                        ...row,
                        Name: row[nameKey] ? row[nameKey].toString().trim() : '',
                        Email: row[emailKey].toString().trim()
                    }));

                if (normalizedRows.length > 0) {
                    setCsvRows(normalizedRows as CsvRow[]);
                }
            },
        });
    };

    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) parseCsv(file);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseCsv(file);
    };

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const addManualRow = () => {
        const trimmedEmail = manualEmail.trim();
        if (!trimmedEmail) return;
        if (!isValidEmail(trimmedEmail)) {
            setManualEmailError('Please enter a valid email address.');
            return;
        }
        const newRow: CsvRow = { Name: manualName.trim() || trimmedEmail.split('@')[0], Email: trimmedEmail };
        setCsvRows(prev => [...prev, newRow]);
        setManualName('');
        setManualEmail('');
        setManualEmailError('');
    };

    const removeRow = (i: number) => setCsvRows(prev => prev.filter((_, idx) => idx !== i));

    const injectVariable = (variable: string) => {
        setEmailBody((prev) => prev + `<span>${variable}</span>`);
    };

    const handleApproveAndSend = async () => {
        setIsSending(true);
        setSendError('');
        try {
            // Actively clear the backend queue to prevent stale dispatches overlapping
            await fetch('http://localhost:5001/api/dispatch/clear', { method: 'DELETE' });

            const res = await fetch('http://localhost:5001/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csvData: csvRows, invoiceDetails, emailSubject, emailBody, senderPool, deliveryMethod, senderName }),
            });
            if (!res.ok) throw new Error(`Server responded with ${res.status}`);
            setAppMode('dispatching');
        } catch (err: unknown) {
            const e = err as { message?: string };
            setSendError(e.message || 'Failed to dispatch. Is the backend running?');
        } finally {
            setIsSending(false);
        }
    };

    const handleSignOut = async () => {
        if (auth) await signOut(auth);
        router.push('/');
    };

    const dummyInvoiceNumber = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
    const firstRow = csvRows[0];
    const unitPrice = parseFloat(invoiceDetails.itemPrice) || 0;
    const qty = parseInt(invoiceDetails.itemQuantity) || 1;
    const subtotal = unitPrice * qty;
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    const canDispatch = senderPool.length > 0 && csvRows.length > 0 && invoiceDetails.productName.trim() !== '' && invoiceDetails.itemPrice.trim() !== '' && emailSubject.trim() !== '';

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 pb-20">
            {/* Dark, aggressive background */}
            <div className="fixed inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full" />

            {/* Top Navigation */}
            <nav className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/50 px-8 py-4 flex flex-col sm:flex-row gap-4 sm:gap-0 items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">RoxInvoice</span>
                </div>

                {/* Stepper */}
                {appMode !== 'dispatching' && (
                    <div className="flex items-center gap-2 sm:gap-4 ml-0 sm:ml-8">
                        {STEPS.map((step, idx) => (
                            <div key={step.id} className="flex items-center">
                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors shadow-2xl ${currentStep === step.id ? 'bg-indigo-600 shadow-indigo-500/20 text-white' : currentStep > step.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-900 border border-zinc-800 text-zinc-500'}`}>
                                    {currentStep > step.id ? <CheckCircle className="w-4 h-4" /> : <step.icon className="w-4 h-4" />}
                                    <span className="hidden sm:inline tracking-widest uppercase text-[10px]">{step.label}</span>
                                </div>
                                {idx < STEPS.length - 1 && <div className={`w-4 sm:w-8 h-px mx-2 ${currentStep > step.id ? 'bg-emerald-500/50' : 'bg-zinc-800'}`} />}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-zinc-400 tracking-widest uppercase">
                        <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-white">{user?.email?.[0].toUpperCase()}</div>
                        {user?.email?.split('@')[0]}
                    </div>
                    <button onClick={handleSignOut} className="p-2 text-zinc-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10" title="Sign Out">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </nav>

            <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-8 relative z-10 animate-in fade-in duration-500">
                {appMode === 'dispatching' ? (
                    <div className="max-w-4xl mx-auto py-10">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8">
                            <div className="bg-[#121214] border border-zinc-800 rounded-[40px] p-6 sm:p-10 space-y-8 shadow-2xl">
                                <div className="flex justify-between items-center pb-4 border-b border-zinc-800/50">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <Terminal className="w-6 h-6 text-indigo-400" /> Dispatch Log
                                    </h2>
                                    <button onClick={() => setAppMode('setup')} className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors px-3 py-1.5 bg-zinc-800 rounded-lg tracking-widest uppercase">Abort / Back</button>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center justify-center shadow-inner">
                                        <span className="text-emerald-400 font-mono text-5xl font-bold">{dispatchStatus.completed}</span>
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Successful</span>
                                    </div>
                                    <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center justify-center shadow-inner">
                                        <span className="text-rose-500 font-mono text-5xl font-bold">{dispatchStatus.failed}</span>
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Failed</span>
                                    </div>
                                </div>
                                <div className="bg-[#050505] border border-zinc-800 rounded-[24px] p-6 h-96 overflow-y-auto font-mono text-sm space-y-1 custom-scrollbar shadow-inner text-zinc-300 relative">
                                    <div className="sticky top-0 left-0 w-full h-4 bg-gradient-to-b from-[#050505] to-transparent pointer-events-none" />
                                    {liveLogs.map((log) => (
                                        <div key={log.id} className="flex gap-4 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                                            <span className={log.type === 'error' ? 'text-rose-500 font-bold' : log.type === 'success' ? 'text-emerald-400 font-bold' : log.type === 'warning' ? 'text-amber-400 font-bold' : log.type === 'timer' ? 'text-purple-400' : 'text-indigo-400'}>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))}
                                    {liveLogs.length === 0 && <div className="text-zinc-600 italic">Awaiting telemetry...</div>}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 rounded-[40px] border border-zinc-800 flex flex-col items-center justify-center space-y-10 shadow-2xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />

                                <h3 className="text-xl font-bold text-white z-10 flex flex-col items-center">
                                    Delivery Success Rate
                                    <span className="text-sm font-normal text-zinc-400 mt-1">Live Telemetry Analysis</span>
                                </h3>

                                <div className="w-64 h-64 relative flex items-center justify-center z-10">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={(() => {
                                                    const totalJobs = dispatchStatus.completed + dispatchStatus.failed;
                                                    if (totalJobs === 0) {
                                                        return [{ name: 'Pending', value: 1, fill: '#27272a' }]; // zinc-800
                                                    }
                                                    return [
                                                        { name: 'Completed', value: dispatchStatus.completed, fill: '#34d399' }, // emerald-400
                                                        { name: 'Failed', value: dispatchStatus.failed, fill: '#f43f5e' } // rose-500
                                                    ];
                                                })()}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={80}
                                                outerRadius={100}
                                                stroke="none"
                                                paddingAngle={5}
                                                dataKey="value"
                                                animationDuration={1500}
                                                animationBegin={0}
                                            >
                                                {(() => {
                                                    const totalJobs = dispatchStatus.completed + dispatchStatus.failed;
                                                    if (totalJobs === 0) {
                                                        return <Cell key="cell-pending" fill="#27272a" />;
                                                    }
                                                    return [
                                                        <Cell key="cell-0" fill="#34d399" />,
                                                        <Cell key="cell-1" fill="#f43f5e" />
                                                    ];
                                                })()}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', color: '#fff' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>

                                    {/* Center Text inside the donut chart */}
                                    <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                        <span className="text-4xl font-black text-white">
                                            {(() => {
                                                const totalJobs = dispatchStatus.completed + dispatchStatus.failed;
                                                return totalJobs > 0 ? `${Math.round((dispatchStatus.completed / totalJobs) * 100)}%` : '0%';
                                            })()}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Yield</span>
                                    </div>
                                </div>

                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 z-10">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" /> System Pulse: Online
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {sendError && (
                            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-sm font-bold flex items-center justify-between">
                                {sendError}
                                <button onClick={() => setSendError('')} className="text-rose-400 hover:text-white"><LogOut className="w-4 h-4 rotate-45" /></button>
                            </div>
                        )}

                        {/* =========================================
                            STEP 1: SETUP (Nodes & Targets)
                           ========================================= */}
                        {currentStep === 1 && (
                            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                                {/* Overview Row */}
                                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {[
                                        { label: 'Target Matrix', val: csvRows.length, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
                                        { label: 'SMTP Nodes', val: senderPool.length, icon: Server, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                                    ].map((stat, i) => (
                                        <div key={i} className={`bg-[#121214] border ${stat.border} p-6 rounded-3xl group hover:bg-zinc-900/80 transition-all shadow-xl`}>
                                            <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
                                            <p className="text-4xl font-black text-white tracking-tight mb-1">{stat.val}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{stat.label}</p>
                                        </div>
                                    ))}
                                    <div className={`bg-gradient-to-br from-zinc-900 to-[#121214] border ${csvRows.length > 0 && senderPool.length > 0 ? 'border-indigo-500/50 shadow-indigo-500/10' : 'border-zinc-800'} p-6 rounded-3xl flex flex-col justify-center items-center text-center shadow-xl relative overflow-hidden group`}>
                                        {csvRows.length > 0 && senderPool.length > 0 && <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />}
                                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${csvRows.length > 0 && senderPool.length > 0 ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-600'} transition-colors`}>
                                            <ShieldCheck className={`w-7 h-7 ${csvRows.length > 0 && senderPool.length > 0 && 'drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]'}`} />
                                        </div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-300 transition-colors">Phase 1 Status</p>
                                        <p className={`text-lg font-black mt-1 ${csvRows.length > 0 && senderPool.length > 0 ? 'text-indigo-400' : 'text-zinc-600'}`}>
                                            {csvRows.length > 0 && senderPool.length > 0 ? 'READY TO COMPOSE' : 'AWAITING INPUTS'}
                                        </p>
                                    </div>
                                </section>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Senders Column (Left) */}
                                    <section className="col-span-1 flex flex-col">
                                        <div className="bg-[#121214] border border-zinc-800/80 rounded-[32px] p-6 sm:p-8 shadow-2xl flex-1 flex flex-col">
                                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800/50">
                                                <h2 className="text-lg font-bold text-white flex items-center gap-3"><Server className="w-5 h-5 text-purple-400" /> SMTP Rotation Array</h2>
                                                <span className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold rounded-lg">{senderPool.length} Nodes</span>
                                            </div>
                                            <div className="space-y-4 mb-8">
                                                {newSenderError && <p className="text-rose-400 text-xs font-bold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">{newSenderError}</p>}
                                                <input type="email" placeholder="SMTP Identity (e.g., node@gmail.com)" value={newSenderEmail} onChange={e => setNewSenderEmail(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-zinc-600 font-medium" />
                                                <input type="password" placeholder="Application Token (xxxx xxxx xxxx xxxx)" value={newSenderPassword} onChange={e => setNewSenderPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-zinc-600 font-medium font-mono" />
                                                <button onClick={() => {
                                                    const em = newSenderEmail.trim();
                                                    const pwd = newSenderPassword.trim();
                                                    if (!em || !pwd) {
                                                        setNewSenderError('Email and App Password are required.');
                                                        return;
                                                    }
                                                    if (!isValidEmail(em)) {
                                                        setNewSenderError('Please enter a valid email address format.');
                                                        return;
                                                    }
                                                    setNewSenderError('');
                                                    setSenderPool([...senderPool, { email: em, appPassword: pwd }]);
                                                    setNewSenderEmail('');
                                                    setNewSenderPassword('');
                                                }} className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 text-sm border border-zinc-700/50">
                                                    <Upload className="w-4 h-4" /> Provision Node
                                                </button>
                                            </div>
                                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar min-h-[150px]">
                                                {senderPool.map((s, idx) => (
                                                    <div key={idx} className="bg-zinc-950 border border-zinc-800/80 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-colors">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-8 h-8 flex-shrink-0 bg-purple-500/10 rounded-lg flex items-center justify-center font-bold text-purple-400 text-xs border border-purple-500/20">{idx + 1}</div>
                                                            <p className="text-sm font-bold text-zinc-300 truncate">{s.email}</p>
                                                        </div>
                                                        <button onClick={() => setSenderPool(senderPool.filter((_, i) => i !== idx))} className="p-2 text-zinc-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
                                                {senderPool.length === 0 && (
                                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50 p-6">
                                                        <Server className="w-8 h-8 text-zinc-600 mb-2" />
                                                        <p className="text-xs font-bold text-zinc-500">No compute nodes active.<br />Provision a sender to begin.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    {/* Recipients Column (Right x2) */}
                                    <section className="col-span-1 lg:col-span-2 flex flex-col">
                                        <div className="bg-[#121214] border border-zinc-800/80 rounded-[32px] p-6 sm:p-8 shadow-2xl flex flex-col flex-1">
                                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800/50">
                                                <h2 className="text-lg font-bold text-white flex items-center gap-3"><Users className="w-5 h-5 text-indigo-400" /> Target Matrix</h2>
                                                <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-lg">{csvRows.length} Acquired</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
                                                {/* Ingress */}
                                                <div className="space-y-6 flex flex-col">
                                                    <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleFileDrop} onClick={() => fileInputRef.current?.click()} className={`flex-1 border-2 border-dashed rounded-[24px] p-8 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[160px] ${isDragging ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' : 'border-zinc-700/50 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900 shadow-inner group'}`}>
                                                        <div className="w-12 h-12 bg-zinc-900 group-hover:bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 transition-colors">
                                                            <Upload className="w-5 h-5 text-indigo-400" />
                                                        </div>
                                                        <p className="text-zinc-200 font-bold text-sm mb-1 text-center group-hover:text-white">Batch Upload (.csv)</p>
                                                        <p className="text-[10px] text-zinc-500 font-mono text-center">Drag & Drop or Click</p>
                                                        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
                                                    </div>

                                                    <div className="bg-zinc-950 border border-zinc-800/80 p-5 rounded-[24px] space-y-3 shadow-inner">
                                                        <div className="flex items-center justify-between px-1">
                                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Manual Injection</span>
                                                        </div>
                                                        <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Target Designation (Name)" className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-zinc-600 font-medium" />
                                                        <div className="flex gap-2">
                                                            <input type="email" value={manualEmail} onChange={e => { setManualEmail(e.target.value); setManualEmailError(''); }} placeholder="target@domain.internal" className={`flex-1 bg-[#121214] border rounded-xl px-4 py-3 text-xs outline-none transition-all placeholder:text-zinc-600 font-medium font-mono ${manualEmailError ? 'border-rose-500 focus:ring-rose-500 animate-shake' : 'border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}`} />
                                                            <button onClick={addManualRow} className="px-5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold rounded-xl transition-all border border-zinc-700/50 text-xs shadow-lg">Inject</button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Buffer */}
                                                <div className="bg-zinc-950 border border-zinc-800/80 rounded-[24px] overflow-hidden flex flex-col shadow-inner max-h-[400px]">
                                                    <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 font-bold text-xs text-zinc-400 flex justify-between items-center">
                                                        <span className="uppercase tracking-widest text-[10px]">Live Memory Buffer</span>
                                                        <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-white">{csvRows.length}</span>
                                                    </div>
                                                    <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-1">
                                                        {csvRows.map((row, i) => (
                                                            <div key={i} className="px-4 py-3 flex justify-between items-center bg-[#121214] rounded-xl border border-zinc-800/50 group hover:border-zinc-700 transition-colors">
                                                                <div className="overflow-hidden">
                                                                    <p className="font-bold text-zinc-200 text-xs truncate">{row.Name || 'Unknown Entity'}</p>
                                                                    <p className="text-zinc-500 text-[10px] font-mono truncate">{row.Email}</p>
                                                                </div>
                                                                <button onClick={() => removeRow(i)} className="text-zinc-700 hover:text-rose-500 p-1.5 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        ))}
                                                        {csvRows.length === 0 && (
                                                            <div className="h-full flex items-center justify-center text-center opacity-50 p-6">
                                                                <p className="text-xs font-bold text-zinc-500">Buffer empty.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button
                                        onClick={() => setCurrentStep(2)}
                                        disabled={csvRows.length === 0 || senderPool.length === 0}
                                        className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl flex items-center gap-3 transition-all active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)]"
                                    >
                                        PROCEED TO COMPOSE <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* =========================================
                            STEP 2: COMPOSE (Content & Preview)
                           ========================================= */}
                        {currentStep === 2 && (
                            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                                <section className="bg-[#121214] border border-zinc-800/80 rounded-[40px] p-6 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col">
                                    {/* Decorative background glow */}
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

                                    <div className="relative z-10 flex flex-col lg:flex-row gap-10">
                                        {/* Editor Side */}
                                        <div className="flex-1 space-y-8">
                                            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/50">
                                                <h2 className="text-lg font-bold text-white flex items-center gap-3"><Layers className="w-5 h-5 text-emerald-400" /> Content Engine</h2>
                                            </div>

                                            {/* Invoice Config */}
                                            <div className="bg-zinc-950 border border-zinc-800/80 p-6 sm:p-8 rounded-[24px] grid grid-cols-1 sm:grid-cols-2 gap-5 shadow-inner">
                                                <h3 className="sm:col-span-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2"><DollarSign className="w-3 h-3" /> Financial Parameters</h3>
                                                {[
                                                    { key: 'logoUrl', label: 'Brand Identity (Logo URL)', colSpan: 2 },
                                                    { key: 'productName', label: 'Asset Designation (Item Name)' },
                                                    { key: 'itemPrice', label: 'Unit Value ($)' },
                                                    { key: 'itemQuantity', label: 'Quantity' },
                                                    { key: 'productDescription', label: 'Detailed Specs (Desc)', colSpan: 2 },
                                                ].map(({ key, label, colSpan }) => (
                                                    <div key={key} className={colSpan === 2 ? 'sm:col-span-2' : ''}>
                                                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2 ml-1">{label}</label>
                                                        <input type={key === 'itemPrice' || key === 'itemQuantity' ? 'number' : 'text'} placeholder={`Enter ${label}...`} value={invoiceDetails[key as keyof InvoiceDetails]} onChange={e => setInvoiceDetails(p => ({ ...p, [key]: e.target.value }))} className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-zinc-700" />
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Delivery Method Config */}
                                            <div className="bg-zinc-950 border border-zinc-800/80 p-6 sm:p-8 rounded-[24px] space-y-4 shadow-inner">
                                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Send className="w-3 h-3" /> Delivery Method</h3>
                                                <div className="flex gap-6">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${deliveryMethod === 'attachment' ? 'border-indigo-500 bg-indigo-500/20' : 'border-zinc-700 bg-zinc-900'}`}>
                                                            {deliveryMethod === 'attachment' && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                                                        </div>
                                                        <input type="radio" value="attachment" checked={deliveryMethod === 'attachment'} onChange={(e) => setDeliveryMethod(e.target.value as any)} className="hidden" />
                                                        <span className={deliveryMethod === 'attachment' ? 'text-indigo-400 font-bold text-sm' : 'text-zinc-400 text-sm'}>Direct PDF Attachment</span>
                                                    </label>
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${deliveryMethod === 'link' ? 'border-indigo-500 bg-indigo-500/20' : 'border-zinc-700 bg-zinc-900'}`}>
                                                            {deliveryMethod === 'link' && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                                                        </div>
                                                        <input type="radio" value="link" checked={deliveryMethod === 'link'} onChange={(e) => setDeliveryMethod(e.target.value as any)} className="hidden" />
                                                        <span className={deliveryMethod === 'link' ? 'text-indigo-400 font-bold text-sm' : 'text-zinc-400 text-sm'}>Secure Viewer Link</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Custom Sender Name Config */}
                                            <div className="bg-zinc-950 border border-zinc-800/80 p-6 sm:p-8 rounded-[24px] space-y-4 shadow-inner">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Users className="w-3 h-3" /> Custom Sender Name</h3>
                                                </div>
                                                <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="e.g. Billing Department, John Doe..." className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-4 text-sm font-bold text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner" />
                                                <p className="text-[10px] text-zinc-500 mt-2">This is the display name shown in recipients' inboxes (e.g. <b>{senderName || 'Invoice Dispatch'}</b> &lt;sender@gmail.com&gt;).</p>
                                            </div>

                                            {/* Email Subject Config */}
                                            <div className="bg-zinc-950 border border-zinc-800/80 p-6 sm:p-8 rounded-[24px] space-y-4 shadow-inner">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Mail className="w-3 h-3" /> Transmission Subject</h3>
                                                    <div className="flex flex-wrap gap-2">
                                                        {['{{Name}}', '{{Invoice_Number}}', '{{Item_Quantity}}', '{{Item_Price}}', '{opt1|opt2}'].map(v => (
                                                            <button key={v} onClick={() => injectVariable(v)} className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-[10px] font-mono font-bold text-emerald-400 rounded-lg hover:bg-zinc-800 transition-colors shadow-sm">{v}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Transmission Subject Line..." className="w-full bg-[#121214] border border-zinc-800 rounded-xl px-4 py-4 text-sm font-bold text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner" />
                                            </div>

                                            {/* Email Body Config */}
                                            <div className="bg-zinc-950 border border-zinc-800/80 rounded-[24px] overflow-hidden shadow-inner flex flex-col">
                                                <div className="p-4 border-b border-zinc-800/50 bg-[#121214]">
                                                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Layers className="w-3 h-3" /> Email Body Content</h3>
                                                    <div className="text-xs text-zinc-400 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 mt-3 leading-relaxed">
                                                        💡 <strong className="text-indigo-400">Pro Tip for Inbox Delivery:</strong> Use <code className="text-emerald-400 font-mono bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800">{'{word1|word2|word3}'}</code> to randomize words and avoid spam filters. The system will auto-select one option per recipient.
                                                    </div>
                                                </div>
                                                <div className="enterprise-quill bg-[#121214]">
                                                    <ReactQuill theme="snow" value={emailBody} onChange={setEmailBody} style={{ height: '350px' }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* STRICT HTML Live Preview Side */}
                                        <div className="w-full lg:w-[450px] xl:w-[500px] shrink-0">
                                            <div className="bg-zinc-950 border border-zinc-800/80 rounded-[32px] p-6 lg:p-8 space-y-6 sticky top-[100px] shadow-2xl flex flex-col max-h-[900px]">
                                                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/50">
                                                    <div className="flex bg-zinc-900 border border-zinc-700/50 rounded-lg p-1">
                                                        <button
                                                            onClick={() => setPreviewMode('email')}
                                                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${previewMode === 'email' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-white'}`}
                                                        >
                                                            Email Preview
                                                        </button>
                                                        <button
                                                            onClick={() => setPreviewMode('pdf')}
                                                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${previewMode === 'pdf' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-white'}`}
                                                        >
                                                            PDF Attachment
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="overflow-hidden bg-zinc-900 rounded-2xl border border-zinc-800/50 relative">
                                                    {previewMode === 'email' ? (
                                                        <div className="bg-[#f8fafc] w-full min-h-[500px] h-full overflow-y-auto custom-scrollbar font-sans p-6 origin-top transform sm:scale-[0.85] lg:scale-100 mx-auto rounded-lg">
                                                            {/* Imitating the strict backend table structure directly in DOM */}
                                                            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ width: '100%', backgroundColor: '#f8fafc', margin: '0 auto' }}>
                                                                <tbody>
                                                                    <tr>
                                                                        <td align="center">
                                                                            <table width="100%" cellPadding="0" cellSpacing="0" border={0} style={{ width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                                                                <tbody>
                                                                                    <tr>
                                                                                        <td align="center" style={{ backgroundColor: '#2563eb', padding: '40px 20px' }}>
                                                                                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔔</div>
                                                                                            <h1 style={{ color: '#ffffff', fontSize: '28px', fontWeight: 'bold', margin: 0, padding: 0 }}>Your Invoice is Ready</h1>
                                                                                        </td>
                                                                                    </tr>
                                                                                    <tr>
                                                                                        <td style={{ padding: '40px', color: '#334155', fontSize: '16px', lineHeight: 1.6 }}>
                                                                                            <div dangerouslySetInnerHTML={{
                                                                                                __html: emailBody
                                                                                                    .replace(/\{+.*?\b(?:Name)\b.*?\}+/gi, firstRow?.Name || 'Client')
                                                                                                    .replace(/\{+.*?\b(?:Invoice_Number)\b.*?\}+/gi, dummyInvoiceNumber)
                                                                                                    .replace(/\{+.*?\b(?:Item_Quantity)\b.*?\}+/gi, qty.toString())
                                                                                                    .replace(/\{+.*?\b(?:Item_Price|Invoice_Value)\b.*?\}+/gi, invoiceDetails.itemPrice || '0.00')
                                                                                                    .replace(/\{([^}]+)\}/g, (match, contents) => contents.split('|')[0]) // Simple spintax preview (picks first option)
                                                                                            }} />
                                                                                        </td>
                                                                                    </tr>
                                                                                    <tr>
                                                                                        <td align="center" style={{ padding: '0 40px 40px 40px' }}>
                                                                                            <table cellPadding="0" cellSpacing="0" border={0}>
                                                                                                <tbody>
                                                                                                    {deliveryMethod === 'link' ? (
                                                                                                        <tr>
                                                                                                            <td align="center" style={{ backgroundColor: '#2563eb', borderRadius: '6px' }}>
                                                                                                                <span style={{ display: 'inline-block', padding: '16px 32px', fontSize: '16px', fontWeight: 'bold', color: '#ffffff', textDecoration: 'none', borderRadius: '6px', cursor: 'pointer' }}>VIEW INVOICE</span>
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    ) : (
                                                                                                        <tr>
                                                                                                            <td align="center" style={{ paddingTop: '16px' }}>
                                                                                                                <p style={{ color: '#64748b', fontSize: '14px', margin: 0, fontWeight: 500 }}>
                                                                                                                    Please find your secure invoice attached below.
                                                                                                                </p>
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    )}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </td>
                                                                                    </tr>
                                                                                    <tr>
                                                                                        <td align="center" style={{ backgroundColor: '#f1f5f9', padding: '24px 40px', borderTop: '1px solid #e2e8f0' }}>
                                                                                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: 1.5 }}>
                                                                                                Thank you for your business.<br />
                                                                                                Please do not reply to this automated email.
                                                                                            </p>
                                                                                        </td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-[600px] bg-zinc-950 flex flex-col relative rounded-lg overflow-hidden">
                                                            {isGeneratingPdf && (
                                                                <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 transition-all">
                                                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                                                                    <p className="text-zinc-400 font-bold text-sm tracking-widest uppercase">Rendering Document...</p>
                                                                </div>
                                                            )}
                                                            {pdfPreviewData ? (
                                                                <iframe src={pdfPreviewData} className="w-full h-full border-none" title="PDF Preview" />
                                                            ) : (
                                                                <div className="flex-1 flex items-center justify-center text-zinc-600 font-bold text-sm">
                                                                    Awaiting Renderer...
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="flex items-center justify-between pt-4">
                                    <button
                                        onClick={() => setCurrentStep(1)}
                                        className="px-8 py-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-400 font-bold rounded-2xl flex items-center gap-3 transition-all active:scale-95"
                                    >
                                        <ChevronLeft className="w-5 h-5" /> BACK TO SETUP
                                    </button>
                                    <button
                                        onClick={() => setCurrentStep(3)}
                                        disabled={invoiceDetails.productName.trim() === '' || invoiceDetails.itemPrice.trim() === '' || emailSubject.trim() === '' || emailBody.replace(/<[^>]*>?/gm, '').trim() === ''}
                                        className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl flex items-center gap-3 transition-all active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)]"
                                    >
                                        PROCEED TO DISPATCH <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* =========================================
                            STEP 3: REVIEW & SEND
                           ========================================= */}
                        {currentStep === 3 && (
                            <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                                {/* Overview Row for Review */}
                                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {[
                                        { label: 'Target Matrix', val: csvRows.length, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
                                        { label: 'SMTP Nodes', val: senderPool.length, icon: Server, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                                        { label: 'Est. Value', val: `$${total.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                                        { label: 'Quantity/Tx', val: invoiceDetails.itemQuantity || 1, icon: Layers, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' }
                                    ].map((stat, i) => (
                                        <div key={i} className={`bg-[#121214] border ${stat.border} p-6 rounded-3xl group hover:bg-zinc-900/80 transition-all shadow-xl`}>
                                            <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
                                            <p className="text-4xl font-black text-white tracking-tight mb-1">{stat.val}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{stat.label}</p>
                                        </div>
                                    ))}
                                </section>

                                {/* Execution Row Header */}
                                <div className={`mt-8 ${canDispatch ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 pointer-events-none'} transition-all duration-700`}>
                                    <div className="bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-transparent p-[1px] rounded-[32px]">
                                        <div className="bg-[#121214] border border-indigo-500/20 rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-indigo-500/5 animate-pulse" />
                                            <div className="relative z-10 flex-1">
                                                <h3 className="text-3xl font-black text-white mb-2 tracking-tight">System Ready for Protocol Execution</h3>
                                                <p className="text-sm font-medium text-zinc-400">
                                                    Transmitting to <strong className="text-indigo-400 font-bold">{csvRows.length} targets</strong> using <strong className="text-purple-400 font-bold">{senderPool.length} nodes</strong>. Payload: {invoiceDetails.productName}.
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleApproveAndSend}
                                                disabled={!canDispatch || isSending}
                                                className="relative z-10 w-full md:w-auto px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] hover:shadow-[0_0_60px_-10px_rgba(99,102,241,0.7)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group whitespace-nowrap overflow-hidden"
                                            >
                                                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                                <span className="relative flex items-center justify-center gap-3 text-xl">
                                                    {isSending ? (
                                                        <><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> CONFIGURING...</>
                                                    ) : (
                                                        <><Zap className="w-6 h-6" /> INITIALIZE DISPATCH</>
                                                    )}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-start pt-4">
                                    <button
                                        onClick={() => setCurrentStep(2)}
                                        disabled={isSending}
                                        className="px-8 py-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-400 font-bold rounded-2xl flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <ChevronLeft className="w-5 h-5" /> REVISE CONTENT
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; } .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #52525b; }
                .enterprise-quill .ql-container { border: none !important; color: #e4e4e7 !important; font-size: 14px !important; font-family: inherit !important; } 
                .enterprise-quill .ql-editor { min-height: 200px; padding: 1.5rem; }
                .enterprise-quill .ql-toolbar { background: #09090b !important; border: none !important; border-bottom: 1px solid #27272a !important; padding: 12px 16px !important; border-top-left-radius: 12px; border-top-right-radius: 12px; }
                .enterprise-quill .ql-stroke { stroke: #a1a1aa !important; } .enterprise-quill .ql-fill { fill: #a1a1aa !important; } .enterprise-quill .ql-picker-label { color: #a1a1aa !important; }
                @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
                .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
                .layout-grid { display: grid; grid-template-rows: auto 1fr; }
            `}</style>
        </div>
    );
}
