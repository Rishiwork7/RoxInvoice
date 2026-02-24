const cheerio = require('cheerio');
const dns = require('dns').promises;

/**
 * Custom Error class for Security Protocol Violations.
 */
class SecurityViolationError extends Error {
    constructor(message, code, details) {
        super(message);
        this.name = 'SecurityViolationError';
        this.code = code;
        this.details = details;
    }
}

/**
 * 1. HTML DOM Scanning Module (Bayesian & Cloaking Check)
 * Scans the raw HTML for CSS evasion tactics used in Bayesian Poisoning.
 */
function scanHtmlDomForCloaking(htmlBody) {
    if (!htmlBody) return [];

    const warnings = [];
    const $ = cheerio.load(htmlBody);

    // CSS selectors commonly used to hide "word salad" from human eyes but visible to spam filters
    const suspiciousSelectors = [
        '[style*="display: none"]',
        '[style*="display:none"]',
        '[style*="visibility: hidden"]',
        '[style*="visibility:hidden"]',
        '[style*="opacity: 0"]',
        '[style*="opacity:0"]',
        '[style*="font-size: 0"]',
        '[style*="font-size:0"]',
        '[style*="font-size: 1px"]',
        '[style*="font-size: 2px"]',
        '[style*="font-size: 3px"]',
        '[style*="color: transparent"]',
        '[style*="color:transparent"]',
        // Position-based cloaking (pushing text off-screen)
        '[style*="position: absolute; left: -9999px"]',
        '[style*="position:absolute;left:-9999px"]',
    ];

    // Combine selectors into a single query
    const query = suspiciousSelectors.join(', ');

    $(query).each((index, element) => {
        const hiddenText = $(element).text().trim();
        if (hiddenText.length > 0) {
            warnings.push({
                type: 'Bayesian Poisoning / Content Cloaking',
                element: element.tagName,
                hiddenTextSnippet: hiddenText.substring(0, 100) + (hiddenText.length > 100 ? '...' : ''),
                reason: 'Detected text hidden via CSS, often used to bypass AI spam filters.'
            });
        }
    });

    return warnings;
}

/**
 * 2. Link Integrity & Evasion Scanner
 * Scans all hyperlinks for URL shorteners, open redirects, and encoding obfuscation.
 */
function scanLinkIntegrity(htmlBody, verifiedDomain = '') {
    if (!htmlBody) return [];

    const warnings = [];
    const $ = cheerio.load(htmlBody);

    // List of globally recognized public URL shorteners often blocked by SEGs
    const publicShorteners = [
        'bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'goo.gl', 'ow.ly', 'rebrand.ly'
    ];

    $('a').each((index, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        try {
            const urlObj = new URL(href);

            // Check 1: Public URL Shorteners (Link Cloaking)
            if (publicShorteners.some(domain => urlObj.hostname.toLowerCase().includes(domain))) {
                warnings.push({
                    type: 'Link Cloaking (Public Shortener)',
                    url: href,
                    reason: `The URL uses a public shortener (${urlObj.hostname}) which is heavily penalized by spam filters.`
                });
            }

            // Check 2: Conditional Routing / Open Redirects (Bot-Aware Cloaking)
            // Look for parameters that look like they contain secondary URLs
            for (const [key, value] of urlObj.searchParams) {
                if (/^url$|^redirect$|^next$|^dest$|^to$/i.test(key) || value.startsWith('http')) {
                    warnings.push({
                        type: 'Evasion Scanner (Open Redirect / Routing Manipulation)',
                        url: href,
                        parameter: key,
                        reason: `The URL contains routing parameters (${key}=${value}) which may be used to serve different content to security bots versus human users.`
                    });
                }
            }

            // Check 3: Multi-layered URL Encoding Obfuscation
            // Standard encoding is fine, but multiple %25 (which is %) indicates obfuscation
            if ((href.match(/%25/g) || []).length > 2) {
                warnings.push({
                    type: 'URL Obfuscation (Multi-layered Encoding)',
                    url: href,
                    reason: 'The URL exhibits excessive encoding, a common tactic to bypass basic link scanners.'
                });
            }

        } catch (e) {
            // Invalid URL format (could be protocol-relative, empty, or genuinely malformed)
            if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                warnings.push({
                    type: 'Malformed URL',
                    url: href,
                    reason: 'The URL failed strict parsing, potentially indicating MIME smuggling or parser bypass attempts.'
                });
            }
        }
    });

    return warnings;
}

/**
 * 3. Infrastructure & Authentication Verifier
 * Verifies SPF and DMARC records for the sender domain.
 */
async function verifyInfrastructure(emailAddress) {
    if (!emailAddress || !emailAddress.includes('@')) {
        return [{ type: 'Infrastructure Error', reason: 'Invalid sender email format provided.' }];
    }

    const domain = emailAddress.split('@')[1];
    const warnings = [];

    try {
        // Determine Domain's SPF Record
        const spfRecordsRaw = await dns.resolveTxt(domain);
        // dns.resolveTxt returns an array of arrays of strings e.g. [ [ 'v=spf1 ...' ] ]
        const txtRecords = spfRecordsRaw.map(recordArray => recordArray.join(''));

        const hasSpf = txtRecords.some(record => record.startsWith('v=spf1'));
        if (!hasSpf) {
            warnings.push({
                type: 'Critical Delivery Risk (Infrastructure Hijacking)',
                domain: domain,
                reason: `No valid SPF record (v=spf1) found for domain ${domain}. Senders without SPF are automatically assumed to be spoofing or hijacking infrastructure and will be dropped by Yahoo/AOL.`
            });
        }

    } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
            warnings.push({ type: 'Critical Delivery Risk (SPF)', domain, reason: `Failed to resolve TXT / SPF records for domain ${domain} (${err.code}).` });
        } else {
            console.error(`[SEG] DNS SPF Lookup Error for ${domain}:`, err);
            // Do not flag general DNS timeouts as definitive spoofing, but log them.
        }
    }

    try {
        // Determine Domain's DMARC Record (_dmarc.domain.com)
        const dmarcDomain = `_dmarc.${domain}`;
        const dmarcRecordsRaw = await dns.resolveTxt(dmarcDomain);
        const txtRecordsDmarc = dmarcRecordsRaw.map(recordArray => recordArray.join(''));

        const hasDmarc = txtRecordsDmarc.some(record => record.startsWith('v=DMARC1'));
        if (!hasDmarc) {
            warnings.push({
                type: 'Critical Delivery Risk (Infrastructure Hijacking)',
                domain: dmarcDomain,
                reason: `No valid DMARC record (v=DMARC1) found at ${dmarcDomain}. Major providers strictly mandate DMARC alignment.`
            });
        }
    } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
            warnings.push({ type: 'Critical Delivery Risk (DMARC)', domain: `_dmarc.${domain}`, reason: `Failed to resolve DMARC records. Major providers strictly mandate DMARC alignment.` });
        } else {
            console.error(`[SEG] DNS DMARC Lookup Error for ${domain}:`, err);
        }
    }

    return warnings;
}


/**
 * Core Analyzer Function executing all security checks.
 * @param {string} htmlBody The raw HTML email body to scan.
 * @param {string} senderEmail The sending identity (e.g., node@trusted-domain.com)
 * @returns {Promise<Array>} An array of security violation objects. Empty array means safe.
 */
async function runPreFlightCheck(htmlBody, senderEmail) {
    let allWarnings = [];

    // Run sync checks
    const cloakingWarnings = scanHtmlDomForCloaking(htmlBody);
    const linkWarnings = scanLinkIntegrity(htmlBody);

    // Run async infrastructure check
    const infraWarnings = await verifyInfrastructure(senderEmail);

    allWarnings = [...cloakingWarnings, ...linkWarnings, ...infraWarnings];

    return allWarnings;
}

/**
 * 4. Express Middleware Wrapper
 * Intercepts outbound dispatch payload, runs analyzer, and blocks if risks detected.
 */
const segMiddleware = async (req, res, next) => {
    try {
        // Expect body payload conforming to dispatch / preview structure
        const { emailBody, senderPool } = req.body;

        if (!emailBody) {
            // Nothing to analyze
            return next();
        }

        // Determine the sender domain. Assuming senderPool contains { email: '...' }
        let primarySenderEmail = null;
        if (senderPool && Array.isArray(senderPool) && senderPool.length > 0) {
            primarySenderEmail = senderPool[0].email;
        }

        if (!primarySenderEmail) {
            // Cannot verify infrastructure without a sender
            console.warn('[SEG] No senderPool provided; skipping infrastructure verification.');
        }

        // Execute the Pre-Flight Analyzer
        console.log(`[SEG] Initiating Pre-Flight Security Scan...`);
        const securityFlags = await runPreFlightCheck(emailBody, primarySenderEmail);

        if (securityFlags.length > 0) {
            // Critical security risks detected. Reject payload.
            console.warn(`[SEG] Payload REJECTED. Security flags triggered:`, securityFlags.length);

            return res.status(400).json({
                error: 'Security Email Gateway (SEG) Policy Violation',
                message: 'The outbound email payload triggered one or more critical security filters. Dispatch aborted to protect domain reputation.',
                flags: securityFlags
            });
        }

        console.log(`[SEG] Pre-Flight Scan Passed. Payload cleared for dispatch.`);
        next();

    } catch (error) {
        console.error('[SEG] Middleware execution failure:', error);
        // Fail closed or open? Standard practice for security gateways is to fail closed, 
        // but to avoid breaking production on weird parse errors, we'll log heavily and return 500.
        return res.status(500).json({
            error: 'SEG Analyzer Failure',
            message: 'Internal server error during Pre-Flight Security Scan.'
        });
    }
};

module.exports = {
    runPreFlightCheck,
    scanHtmlDomForCloaking,
    scanLinkIntegrity,
    verifyInfrastructure,
    segMiddleware
};
