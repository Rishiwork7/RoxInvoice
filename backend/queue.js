const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const dns = require('dns');

// ─── Localhost Redis Connection ─────────────────────────────────────────────────
const redisOptions = process.env.REDIS_URL
  ? {
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
  }
  : { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null };

const connection = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptions)
  : new Redis(redisOptions);

const invoiceQueue = new Queue('invoice-queue', { connection });

// ─── Live UI Event Logger ─────────────────────────────────────────────────────
async function emitLiveLog(jobId, message, type = 'info') {
  const logEntry = JSON.stringify({
    id: Date.now() + Math.random(),
    jobId,
    message,
    type,
    time: new Date().toLocaleTimeString('en-US', { hour12: false })
  });
  await connection.rpush('live_dispatch_logs', logEntry);
  await connection.ltrim('live_dispatch_logs', -100, -1); // Keep last 100 max

  // Terminal fallback
  if (type === 'error') console.error(`[${type.toUpperCase()}] ${message}`);
  else if (type === 'warning') console.warn(`[${type.toUpperCase()}] ${message}`);
  else console.log(`[${type.toUpperCase()}] ${message}`);
}

// ─── Spintax Parser ───────────────────────────────────────────────────────────
const parseSpintax = (text) => {
  if (!text) return text;
  let result = text;
  // ONLY match curly braces that actually contain a pipe | character inside them.
  // This physically prevents it from destroying {{Name}} or {Invoice_Number} variables.
  const spintaxRegex = /\{([^{}]*\|[^{}]*)\}/g;
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (match, contents) => {
      const options = contents.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
};

/**
 * Human-like async delay utility.
 */
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Generate a cryptographically unique invoice ID.
 */
const generateInvoiceId = () =>
  `INV-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

// ─── SMTP Transporter ─────────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', // MUST be the domain name so Google's TLS SNI handshake succeeds
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
};

// ─── Tag Replacement ──────────────────────────────────────────────────────────
const replaceTags = (text, recipient, invoiceNumber, itemQuantity, itemPrice) => {
  if (!text) return '';
  let result = text;

  // Reusable helper to replace tags even if they contain weird Quill HTML (e.g. {{ <span>Name</span> }})
  const cleanReplace = (keywordRegexStr, replacementText) => {
    // Looks for 1+ { braces, optional space/HTML, exactly keyword, optional space/HTML, 1+ } braces
    const pattern = new RegExp(`\\{+.*?\\b(?:${keywordRegexStr})\\b.*?\\}+`, 'gi');
    result = result.replace(pattern, replacementText);
  };

  cleanReplace('Name', recipient.Name || 'Customer');
  cleanReplace('Email', recipient.Email || '');
  cleanReplace('Invoice[\\s_]*Number', invoiceNumber);
  cleanReplace('Product[\\s_]*Name', recipient.Product_Name || 'Item');
  cleanReplace('Item[\\s_]*Quantity', itemQuantity || '1');
  cleanReplace('Item[\\s_]*Price', itemPrice || '0.00');
  cleanReplace('Invoice[\\s_]*Value', itemPrice || '0.00'); // Handle aliases

  return result;
};

// ─── Email HTML Builder ───────────────────────────────────────────────────────
const buildEmailHtml = ({ recipientName, invoiceNumber, bodyContent, companyLogoUrl, pdfUrl, trackingId, deliveryMethod }) => {
  const logoHtml = companyLogoUrl && companyLogoUrl.startsWith('http')
    ? `<img src="${companyLogoUrl}" height="40" alt="Company Logo" style="display:block;height:40px;margin: 0 auto;" />`
    : `<span style="font-size:24px;font-weight:bold;color:#1e293b;">${companyLogoUrl || 'Your Company'}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Invoice is Ready</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Inter', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Hidden Preheader for strict personalization bypass -->
  <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Invoice ${invoiceNumber} for ${recipientName} is enclosed. Please review your balance immediately.
  </div>
  
  <!-- Background Wrapper -->
  <table width="100%" bgcolor="#f8fafc" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f8fafc; padding: 40px 0;">
    <tr>
      <td align="center">
        
        <!-- Main Card -->
        <table width="600" bgcolor="#ffffff" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Hero Banner -->
          <tr>
            <td bgcolor="#2563eb" align="center" style="background-color: #2563eb; padding: 40px 20px;">
              <div style="font-size: 32px; margin-bottom: 12px;">🔔</div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; padding: 0;">Your Invoice is Ready</h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px; color: #334155; font-size: 16px; line-height: 1.6;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Action Button -->
          <tr>
            <td align="center" style="padding: 0 40px 40px 40px;">
              <table cellpadding="0" cellspacing="0" border="0">
                ${deliveryMethod === 'link' ? `
                <tr>
                  <td align="center" bgcolor="#2563eb" style="border-radius: 6px;">
                    <a href="${pdfUrl || '#'}" target="_blank" style="display: inline-block; padding: 16px 32px; font-family: 'Inter', Arial, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 6px;">VIEW INVOICE</a>
                  </td>
                </tr>
                ` : `
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <p style="color: #64748b; font-size: 14px; margin: 0; font-weight: 500;">
                      Please find your secure invoice attached below.
                    </p>
                  </td>
                </tr>
                `}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f1f5f9" align="center" style="background-color: #f1f5f9; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                Thank you for your business.<br>
                Please do not reply to this automated email.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

  <!-- Tracking metadata to ensure binary uniqueness -->
  <div style="display:none; max-height:0px; overflow:hidden;">${trackingId}</div>
</body>
</html>`;
};

// ─── BullMQ Worker ────────────────────────────────────────────────────────────
const emailWorker = new Worker('invoice-queue', async (job) => {
  try {
    const { recipient, invoiceDetails, emailSubject, emailBody, senderPool, deliveryMethod = 'attachment', senderName = 'Invoice Dispatch' } = job.data;

    if (!senderPool || !Array.isArray(senderPool) || senderPool.length === 0) {
      throw new Error('No sender pool provided in job data.');
    }

    const recipientDomain = recipient.Email.split('@')[1]?.toLowerCase() || '';
    const strictDomains = ['yahoo.com', 'aol.com', 'verizon.net', 'ymail.com']; // Strictly enforced delay domains

    const trackingId = crypto.randomUUID();
    const invoiceNumber = generateInvoiceId();

    let success = false;
    let lastError;
    let selectedSender;
    let isFirstAttempt = true;

    const startIndex = parseInt(job.id) || 0;

    for (let i = 0; i < senderPool.length; i++) {
      const senderIndex = (startIndex + i) % senderPool.length;
      const candidateSender = senderPool[senderIndex];

      const isPaused = await connection.get(`paused_sender:${candidateSender.email}`);
      if (isPaused) {
        if (i === senderPool.length - 1 && !success) {
          await emitLiveLog(job.id, `[SKIP] ${candidateSender.email} is paused (rate limit).`, 'warning');
        }
        continue;
      }

      selectedSender = candidateSender;

      await emitLiveLog(job.id, `Starting for: ${recipient.Email} (Invoice: ${invoiceNumber})`, 'info');
      await emitLiveLog(job.id, `Via Sender: ${selectedSender.email} | Recipient Domain: ${recipientDomain}`, 'info');

      const spunSubject = parseSpintax(emailSubject);
      const spunBody = parseSpintax(emailBody);

      const customizedSubject = replaceTags(spunSubject, recipient, invoiceNumber, invoiceDetails?.itemQuantity, invoiceDetails?.itemPrice);
      const customizedBody = replaceTags(spunBody, recipient, invoiceNumber, invoiceDetails?.itemQuantity, invoiceDetails?.itemPrice);

      await emitLiveLog(job.id, `Subject (50c): ${customizedSubject.substring(0, 50)}`, 'info');
      await emitLiveLog(job.id, `Body (50c): ${customizedBody.replace(/<[^>]*>?/gm, '').substring(0, 50)}...`, 'info');

      const baseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
      const viewerUrl = `${baseUrl}/invoice/${invoiceNumber}`;

      const finalHtml = buildEmailHtml({
        recipientName: recipient.Name || 'Valued Customer',
        invoiceNumber,
        bodyContent: customizedBody,
        companyLogoUrl: invoiceDetails?.logoUrl,
        trackingId,
        pdfUrl: viewerUrl,
        deliveryMethod
      });

      const payloadSizeKb = Buffer.byteLength(finalHtml, 'utf8') / 1024;
      if (isFirstAttempt) { // Log payload size only on the first iteration
        await emitLiveLog(job.id, `Payload Size: ${payloadSizeKb.toFixed(2)} KB`, 'info');
        if (payloadSizeKb > 100) {
          await emitLiveLog(job.id, `HTML size is > 100KB which may trigger Gmail clipping!`, 'warning');
        }
        isFirstAttempt = false;
      }

      // ─── Generate PDF Attachment In-Memory ────────────────────────────────
      await emitLiveLog(job.id, `Generating PDF Attachment...`, 'info');

      let pdfBuffer = null;
      let browser = null;
      try {
        browser = await puppeteer.launch({
          headless: 'new',
          protocolTimeout: 60000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--font-render-hinting=none',
            '--disable-dev-shm-usage', // Overcome limited resource constraints in docker/linux
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            ...(process.env.RAILWAY_ENVIRONMENT || process.platform === 'linux' ? ['--no-zygote', '--single-process'] : [])
          ]
        });
        const page = await browser.newPage();

        // Ensure page default timeout is increased for slow cloud instances
        page.setDefaultNavigationTimeout(60000);

        // --- X-Ray Logging & Resource Blocking ---
        page.on('requestfailed', req => console.log('[X-RAY] Failed:', req.url(), req.failure()?.errorText));
        await page.setRequestInterception(true);
        page.on('request', req => {
          console.log('[X-RAY] Loading:', req.url());
          const blocked = ['script', 'media', 'font', 'websocket', 'manifest', 'other', 'fetch', 'xhr'];
          if (blocked.includes(req.resourceType())) {
            req.abort();
          } else {
            req.continue();
          }
        });
        // -----------------------------------------


        // Aesthetic invoice template for the PDF
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

        console.log(`[DEBUG] Puppeteer setting content for PDF generation for invoice ${invoiceNumber}`);
        await page.setContent(pdfHtmlTemplate, { waitUntil: 'load', timeout: 60000 });
        const pdfUint8Array = await page.pdf({ format: 'A4', printBackground: true, timeout: 60000 });
        pdfBuffer = Buffer.from(pdfUint8Array);
      } catch (pdfError) {
        console.error('[ERROR] Puppeteer PDF Generation crashed:', pdfError.message);
        await emitLiveLog(job.id, `PDF Generation FATAL Crash: ${pdfError.message}`, 'error');
        throw new Error(`Puppeteer engine failed to build PDF. Root cause: ${pdfError.message}`);
      } finally {
        if (browser) {
          await browser.close().catch(e => console.error('[ERROR] Failed to close browser:', e));
        }
      }

      const parsedPort = parseInt(selectedSender.port) || 465;
      const isSecure = parsedPort === 465;

      const transportConfig = selectedSender.host ? {
        host: selectedSender.host,
        port: parsedPort,
        secure: isSecure,
        auth: {
          user: selectedSender.email,
          pass: selectedSender.appPassword,
        },
        pool: true,
        maxConnections: 1,
        maxMessages: 10,
        tls: { rejectUnauthorized: false },
        family: process.env.SMTP_IP_FAMILY ? parseInt(process.env.SMTP_IP_FAMILY) : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000, // 30s timeout for sending the actual payload
      } : {
        host: 'smtp.gmail.com', // MUST be domain name for TLS SNI
        port: 465,
        secure: true,
        auth: {
          user: selectedSender.email,
          pass: selectedSender.appPassword,
        },
        pool: true,
        maxConnections: 1,
        maxMessages: 10,
        tls: { rejectUnauthorized: false },
        family: process.env.SMTP_IP_FAMILY ? parseInt(process.env.SMTP_IP_FAMILY) : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
      };

      const transporter = nodemailer.createTransport(transportConfig);

      // Domain extraction for Message-ID
      const senderDomain = selectedSender.host ? selectedSender.host.replace('smtp.', '') : selectedSender.email.split('@')[1] || 'localhost.com';
      const messageId = `<${crypto.randomUUID()}@${senderDomain}>`;

      const mailOptions = {
        from: `"${senderName}" <${selectedSender.email}>`,
        to: recipient.Email,
        subject: customizedSubject,
        html: finalHtml,
        messageId: messageId,
        xMailer: false, // Strip the automatic X-Mailer header revealing Node
        priority: 'normal',
        headers: {
          'List-Unsubscribe': `<mailto:unsubscribe@${senderDomain}>`
        }
      };

      if (deliveryMethod === 'attachment') {
        mailOptions.attachments = [
          {
            filename: `Invoice_${invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ];
      } else {
        // Link mode: save PDF into Redis as Base64 for the viewer endpoint to fetch
        await connection.setex(`invoice_pdf:${invoiceNumber}`, 86400 * 30, pdfBuffer.toString('base64'));
      }

      try {
        await transporter.sendMail(mailOptions);

        await emitLiveLog(job.id, `Email physically sent to ${recipient.Email} via ${selectedSender.email}`, 'success');
        success = true;
        break; // Successfully sent, break retry loop
      } catch (err) {
        lastError = err;
        const msg = err.message || '';

        // Detect typical rate limits and Auth blocks
        if (msg.includes('Rate Limit') || msg.includes('421') || msg.includes('450') || msg.includes('452') || msg.includes('550 5.4.5') || msg.includes('quota') || msg.includes('BadCredentials')) {
          await emitLiveLog(job.id, `[RATE LIMIT / BLOCKED] Pausing account ${selectedSender.email} for 1 hour.`, 'error');
          await connection.setex(`paused_sender:${selectedSender.email}`, 3600, 'true');
          continue; // Try the next node
        } else {
          // Unhandled error
          throw err;
        }
      }
    }

    if (!success) {
      if (lastError) throw lastError;
      throw new Error('All SMTP sender accounts are paused due to rate limits or invalid credentials.');
    }

    // 6. Human-like random delay before resolving
    let randomDelay = Math.floor(Math.random() * (20000 - 8000 + 1)) + 8000; // 8s to 20s

    if (strictDomains.includes(recipientDomain)) {
      randomDelay = Math.floor(Math.random() * (45000 - 25000 + 1)) + 25000; // 25s to 45s for Yahoo/AOL/Verizon
      await emitLiveLog(job.id, `Strict domain network detected (${recipientDomain}). Increasing throttle delay to ${(randomDelay / 1000).toFixed(1)}s`, 'warning');
    } else {
      await emitLiveLog(job.id, `Pausing worker for ${(randomDelay / 1000).toFixed(1)} seconds...`, 'timer');
    }

    await wait(randomDelay);

    return { success: true, invoiceNumber, sender: selectedSender.email };

  } catch (error) {
    await emitLiveLog(job.id || 'N/A', `Job failed FATALLY: ${error.message}`, 'error');
    throw error;
  }
}, {
  connection,
  // Ensures jobs are processed one-at-a-time per worker instance,
  // safe for concurrent browser tabs adding to the same queue.
  concurrency: 1,
});

module.exports = { invoiceQueue, emailWorker, connection };
