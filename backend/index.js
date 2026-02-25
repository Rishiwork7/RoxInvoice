const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const puppeteer = require('puppeteer'); // Added puppeteer
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize Firebase Admin (Required for uploading to Cloud Storage)
if (!admin.apps.length) {
  let credential;

  // 1. Check for Environment Variable (Railway/Cloud)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
      console.log('Firebase initialized with FIREBASE_SERVICE_ACCOUNT env var');
    } catch (err) {
      console.error('⚠️ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', err.message);
    }
  }

  // 2. Fallback to local JSON file (Local dev)
  if (!credential) {
    try {
      const serviceAccount = require('./serviceAccountKey.json');
      credential = admin.credential.cert(serviceAccount);
      console.log('Firebase initialized with serviceAccountKey.json');
    } catch (err) {
      console.warn('⚠️ serviceAccountKey.json not found and no env var provided.');
    }
  }

  // 3. Fallback to Application Default
  if (!credential) {
    console.log('Falling back to default credentials.');
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential
  });
}

const { invoiceQueue, connection } = require('./queue');
const { segMiddleware } = require('./segMiddleware');

const app = express();
const port = process.env.PORT || 5001;

// ─── Security Middleware: Helmet ──────────────────────────────────────────────
app.use(helmet());

// ─── Security Middleware: Strict CORS ─────────────────────────────────────────
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};
app.use(cors(corsOptions));

// ─── Security Middleware: Rate Limiter ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Use express.json with a higher limit for large CSV/payloads
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Backend API' });
});

// The Preview Endpoint
app.post('/api/preview', apiLimiter, (req, res) => {
  try {
    const { csvData, invoiceDetails, emailSubject, emailBody } = req.body;

    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({ error: 'No CSV data provided' });
    }

    // Slice to process only the first 3 rows
    const previewRows = csvData.slice(0, 3);

    const processedPreviews = previewRows.map((recipient) => {
      // Generate a unique Invoice Number
      const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Standard Regex replacement wrapper
      const replaceTags = (text) => {
        if (!text) return '';
        let result = text;
        // Replace globally case-insensitively or exactly matching the {{Tag}} format
        result = result.replace(/\{\{Name\}\}/gi, recipient.Name || '');
        result = result.replace(/\{\{Email\}\}/gi, recipient.Email || '');
        result = result.replace(/\{\{Invoice_Number\}\}/gi, invoiceNumber);
        return result;
      };

      const finalizedSubject = replaceTags(emailSubject);
      const finalizedBody = replaceTags(emailBody);

      return {
        name: recipient.Name,
        email: recipient.Email,
        subject: finalizedSubject,
        body: finalizedBody,
        invoiceNumber: invoiceNumber
      };
    });

    res.json({ success: true, previews: processedPreviews });

  } catch (error) {
    console.error('Error generating previews:', error);
    res.status(500).json({ error: 'Internal Server Error during preview generation' });
  }
});

// The Dispatch Endpoint (Async Queue)
app.post('/api/dispatch', apiLimiter, segMiddleware, async (req, res) => {
  try {
    const { csvData, invoiceDetails, emailSubject, emailBody, senderPool, deliveryMethod } = req.body;

    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      return res.status(400).json({ error: 'No valid recipient data provided' });
    }

    if (!senderPool || !Array.isArray(senderPool) || senderPool.length === 0) {
      return res.status(400).json({ error: 'No sender pool provided' });
    }

    // Clear the real-time terminal redis store for a fresh UI
    await connection.del('live_dispatch_logs');

    // Iterate through all approved recipients to queue them
    for (const recipient of csvData) {
      await invoiceQueue.add('generate-invoice', {
        recipient,
        invoiceDetails,
        emailSubject,
        emailBody,
        senderPool,
        deliveryMethod
      });
    }

    return res.status(200).json({ success: true, message: 'Jobs Queued successfully' });
  } catch (error) {
    console.error('Error dispatching jobs:', error);
    return res.status(500).json({ error: 'Internal Server Error during dispatch' });
  }
});

// The Dispatch Target Clear Logs Endpoint
app.delete('/api/dispatch/clear', async (req, res) => {
  try {
    try {
      await invoiceQueue.obliterate({ force: true });
    } catch (e) {
      console.warn('Obliterate hit a lock, running aggressive category clean...', e.message);
      await invoiceQueue.pause();
      await invoiceQueue.clean(0, 100000, 'wait');
      await invoiceQueue.clean(0, 100000, 'active');
      await invoiceQueue.clean(0, 100000, 'delayed');
      await invoiceQueue.clean(0, 100000, 'completed');
      await invoiceQueue.clean(0, 100000, 'failed');
      await invoiceQueue.resume();
    }
    res.json({ success: true, message: 'Queue and logs cleared' });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
});

// The Dispatch Retry Endpoint
app.post('/api/dispatch/retry', async (req, res) => {
  try {
    const failedJobs = await invoiceQueue.getFailed();
    const retryPromises = failedJobs.map(job => job.retry());
    await Promise.all(retryPromises);
    res.json({ success: true, message: `Retrying ${failedJobs.length} failed jobs` });
  } catch (error) {
    console.error('Error retrying jobs:', error);
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});

// The Dispatch Status Tracker Endpoint
app.get('/api/dispatch-status', async (req, res) => {
  try {
    const counts = await invoiceQueue.getJobCounts('waiting', 'active', 'completed', 'failed');

    // Fetch last 20 jobs
    const completedJobs = await invoiceQueue.getJobs(['completed'], 0, 20, true);
    const failedJobs = await invoiceQueue.getJobs(['failed'], 0, 20, true);

    // Combine and Sort newest first
    const allJobs = [...completedJobs, ...failedJobs].sort((a, b) => {
      const timeA = a.finishedOn || a.processedOn || a.timestamp;
      const timeB = b.finishedOn || b.processedOn || b.timestamp;
      return timeB - timeA;
    }).slice(0, 20);

    // Map to standard logs array
    const logs = allJobs.map(job => {
      const isFailed = !!job.failedReason;
      const email = job.data?.recipient?.Email || 'Unknown';
      const invoiceNumber = job.returnvalue?.invoiceNumber || '-';
      return {
        timestamp: job.finishedOn || job.processedOn || job.timestamp,
        status: isFailed ? 'failed' : 'completed',
        email,
        message: isFailed ? `Failed to send to ${email}: ${job.failedReason}` : `Invoice ${invoiceNumber} sent to ${email}`
      };
    });

    // Sum up totalSales from all completed invoices
    const allCompleted = await invoiceQueue.getJobs(['completed'], 0, 100000, true);
    let totalSales = 0;
    allCompleted.forEach(job => {
      const price = parseFloat(job.data?.invoiceDetails?.itemPrice || 0);
      const qty = parseInt(job.data?.invoiceDetails?.itemQuantity || 0);
      totalSales += (price * qty);
    });

    // Fetch highly detailed real-time event logs from Redis Worker directly
    const rawLogs = await connection.lrange('live_dispatch_logs', 0, -1);
    const liveLogs = rawLogs.map(log => JSON.parse(log));

    res.json({ success: true, counts, logs, totalSales, liveLogs });
  } catch (error) {
    console.error('Error fetching dispatch status:', error);
    res.status(500).json({ error: 'Failed to fetch dispatch status' });
  }
});

// Fetch PDF URL for a given Invoice ID
app.get('/api/invoice/:id', async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const pdfBase64 = await connection.get(`invoice_pdf:${invoiceId}`);

    if (!pdfBase64) {
      return res.status(404).json({ error: 'Invoice not found or expired' });
    }

    res.json({ success: true, pdfBase64 });
  } catch (error) {
    console.error(`Error fetching invoice ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Generate dynamic PDF Preview for the frontend
app.post('/api/preview-pdf', async (req, res) => {
  try {
    const { invoiceDetails, recipient } = req.body;
    const invoiceNumber = 'INV-PREVIEW-123';

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // CRITICAL for Railway/Linux
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();

    // Aesthetic invoice template for the PDF preview (MUST MATCH queue.js EXACTLY)
    const pdfHtmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .invoice-title { font-size: 32px; font-weight: bold; color: #2563eb; }
          .details { display: flex; justify-content: space-between; margin-bottom: 40px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 12px; background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; font-size: 14px; text-transform: uppercase; color: #475569; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
          .total-row td { background-color: #f8fafc; font-weight: bold; font-size: 18px; color: #0f172a; border-top: 2px solid #cbd5e1; }
          .footer { margin-top: 60px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
          .logo-placeholder { background: #f1f5f9; padding: 12px 24px; border-radius: 8px; font-weight: bold; color: #64748b; border: 2px dashed #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            ${invoiceDetails?.logoUrl ? `<img src="${invoiceDetails.logoUrl}" style="max-height: 60px; object-fit: contain;">` : '<div class="logo-placeholder">COMPANY LOGO</div>'}
          </div>
          <div class="invoice-title">INVOICE</div>
        </div>
        
        <div class="details">
          <div>
            <strong style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Billed To</strong><br>
            <div style="font-size: 16px; font-weight: bold; margin-top: 4px;">${recipient?.Name || 'Client Name'}</div>
            <div style="color: #475569;">${recipient?.Email || 'client@example.com'}</div>
          </div>
          <div style="text-align: right;">
            <strong style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Invoice Details</strong><br>
            <div style="margin-top: 4px;"><strong>No:</strong> ${invoiceNumber}</div>
            <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
          <strong style="color: #0f172a; font-size: 14px;">Description:</strong>
          <p style="color: #475569; margin-top: 8px; margin-bottom: 0; line-height: 1.5;">${invoiceDetails?.productDescription || 'Professional services rendered for the current billing cycle.'}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item / Service</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style="font-weight: bold;">${recipient?.Product_Name || invoiceDetails?.productName || 'Premium Services'}</div>
              </td>
              <td style="text-align: center;">${invoiceDetails?.itemQuantity || 1}</td>
              <td style="text-align: right;">$${parseFloat(invoiceDetails?.itemPrice || 0).toFixed(2)}</td>
              <td style="text-align: right; font-weight: bold;">$${(parseFloat(invoiceDetails?.itemPrice || 0) * parseInt(invoiceDetails?.itemQuantity || 1)).toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3" style="text-align: right; padding-top: 20px;">Total Amount Due:</td>
              <td style="text-align: right; padding-top: 20px;">$${(parseFloat(invoiceDetails?.itemPrice || 0) * parseInt(invoiceDetails?.itemQuantity || 1)).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        <div class="footer">
          Thank you for your business. Payment is due upon receipt. If you have any questions regarding this invoice, please contact our support team.
        </div>
      </body>
      </html>
    `;

    await page.setContent(pdfHtmlTemplate, { waitUntil: 'networkidle0' });
    const pdfUint8Array = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    const pdfBuffer = Buffer.from(pdfUint8Array);

    res.json({ success: true, pdfBase64: pdfBuffer.toString('base64') });
  } catch (error) {
    console.error(`Error generating PDF preview:`, error);
    res.status(500).json({ error: 'Failed to generate PDF preview' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
