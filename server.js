const express = require('express');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

require('dotenv').config();

const app = express();
const PORT = process.env.EX2_PORT || 3042;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Basic request logger with request ID and timing
app.use((req, res, next) => {
    const startMs = Date.now();
    const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    req._reqId = reqId;
    try {
        const method = req.method;
        const url = req.originalUrl || req.url;
        console.log(`[${reqId}] → ${method} ${url}`);
        if (method !== 'GET') {
            try {
                const bodyPreview = JSON.stringify(req.body);
                console.log(`[${reqId}] body: ${bodyPreview?.length > 1000 ? bodyPreview.slice(0, 1000) + '…' : bodyPreview}`);
            } catch (e) {
                console.log(`[${reqId}] body: <unserializable>`);
            }
        }
    } catch (_) {
        // ignore logger errors
    }
    res.on('finish', () => {
        const ms = Date.now() - startMs;
        console.log(`[${reqId}] ← ${res.statusCode} (${ms}ms)`);
    });
    next();
});

// API configuration
const API_BASE_URL = process.env.API_BASE_URL;
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const API_NETWORK = process.env.API_NETWORK || 'public';
const CERT_FONT_FAMILY = process.env.CERT_FONT_FAMILY || 'DejaVu Sans, Arial, sans-serif';
const CERT_TEMPLATE = process.env.CERT_TEMPLATE || 'default.svg';
const FOOTER = process.env.FOOTER || '';
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Quiz questions (load from .env QUIZ or fallback)
const QUIZ_FILE = process.env.QUIZ || 'questions.json';
let quizQuestions = [];
let quizTitle = 'Quiz';
let quizTemplate = null; // optional per-quiz template override
try {
    const quizPath = path.join(__dirname, QUIZ_FILE);
    const loaded = require(quizPath);
    if (Array.isArray(loaded)) {
        quizQuestions = loaded;
        quizTitle = 'Quiz';
    } else if (loaded && typeof loaded === 'object') {
        quizTitle = loaded.title || 'Quiz';
        quizQuestions = Array.isArray(loaded.questions) ? loaded.questions : [];
        if (typeof loaded.template === 'string' && loaded.template.trim().length > 0) {
            quizTemplate = loaded.template.trim();
        }
    }
    console.log(`Loaded quiz from ${QUIZ_FILE} (title: ${quizTitle}, questions: ${quizQuestions.length}, template: ${quizTemplate || CERT_TEMPLATE})`);
} catch (e) {
    console.error(`Failed to load quiz file '${QUIZ_FILE}':`, e.message);
    quizQuestions = [];
}



async function loadCertificateTemplate(preferredTemplateName) {
    // Load template from templates directory; fallback to default inline template if missing
    const candidatePaths = [
        preferredTemplateName ? path.join(TEMPLATES_DIR, preferredTemplateName) : null,
        path.join(TEMPLATES_DIR, CERT_TEMPLATE),
        path.join(TEMPLATES_DIR, 'default.svg')
    ];
    for (const templatePath of candidatePaths) {
        if (!templatePath) continue;
        try {
            const svg = await fs.readFile(templatePath, 'utf8');
            console.log(`[template] Loaded certificate template from: ${templatePath}`);
            return svg;
        } catch (e) {
            // try next
            console.log(`[template] Missing template candidate: ${templatePath}`);
        }
    }
    return null;
}

function applyTemplatePlaceholders(svgContent, replacements) {
    // Remove inline tspan wrappers that can split placeholders
    let cleaned = svgContent.replace(/<\/?tspan[^>]*>/gi, '');
    const escapeForRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapeXml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    let result = cleaned;
    for (const [key, value] of Object.entries(replacements)) {
        const pattern = new RegExp(`##${escapeForRegex(key)}##`, 'g');
        result = result.replace(pattern, escapeXml(value));
    }
    return result;
}

function prepareSvgForSharp(svg) {
    // Strip XML declaration and DOCTYPE which can confuse some renderers
    let out = svg.replace(/<\?xml[\s\S]*?\?>/i, '').replace(/<!DOCTYPE[\s\S]*?>/i, '');
    // Ensure numeric width/height instead of percentages if present
    out = out.replace(/width="100%"/i, 'width="800"').replace(/height="100%"/i, 'height="600"');
    return out;
}

async function withTimeout(promise, ms, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms${label ? ` (${label})` : ''}`)), ms);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

function sanitizeUserName(input) {
    if (input === undefined || input === null) return '';
    const normalized = String(input).normalize('NFKC');
    // Allow letters, numbers, space and a small set of punctuation typical in names
    const stripped = normalized.replace(/[^\p{L}\p{N} .,'-]/gu, '');
    const collapsed = stripped.replace(/\s+/g, ' ').trim();
    return collapsed.slice(0, 80);
}

// Generate certificate with name and date and return buffer + certificateId
async function generateCertificate(name, title, templateName, reqId) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const certificateId = Date.now().toString();

    // Try to load external SVG template
    console.log(`[${reqId || 'cert'}] Generating certificate (name="${name}", title="${title}", template="${templateName}")`);
    const loadedTemplate = await loadCertificateTemplate(templateName);

    let svgToRender;
    if (loadedTemplate) {
        const replacements = {
            CERT_TITLE: 'Certificate of Completion',
            COURSE_TITLE: title,
            INTRO_TEXT: 'This is to certify that',
            NAME: name,
            COMPLETION_TEXT: `has successfully completed the ${title}`,
            SECONDARY_TEXT: 'with a perfect score.',
            DATE: currentDate,
            CERT_ID: certificateId,
            FOOTER: FOOTER
        };
        console.log(`[${reqId || 'cert'}] Applying placeholders: ${Object.keys(replacements).join(', ')}`);
        svgToRender = applyTemplatePlaceholders(loadedTemplate, replacements)
            // allow template fonts to be adjusted by env by replacing default family occurrences
            .replace(/DejaVu Sans, Arial, sans-serif/g, CERT_FONT_FAMILY);
        const unresolved = svgToRender.match(/##[A-Z0-9_]+##/g);
        if (unresolved) {
            console.warn(`[${reqId || 'cert'}] Warning: Unresolved placeholders remain: ${[...new Set(unresolved)].join(', ')}`);
        }
        svgToRender = prepareSvgForSharp(svgToRender);
        console.log(`[${reqId || 'cert'}] SVG length after prep: ${svgToRender.length}`);
        console.log(`[${reqId || 'cert'}] SVG preview: ${svgToRender.slice(0, 200).replace(/\n/g, ' ')}…`);
    } else {
        // Fallback inline template
        svgToRender = `
			<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
				<rect width="800" height="600" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
				<rect x="50" y="50" width="700" height="500" fill="white" stroke="#007bff" stroke-width="3"/>
				<text x="400" y="120" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="36" font-weight="bold" fill="#007bff">Certificate of Completion</text>
				<text x="400" y="160" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="18" fill="#6c757d">${title}</text>
				<text x="400" y="250" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="20" fill="#212529">This is to certify that</text>
				<text x="400" y="300" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="28" font-weight="bold" fill="#007bff">${name}</text>
				<text x="400" y="350" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="20" fill="#212529">has successfully completed the ${title}</text>
				<text x="400" y="380" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="20" fill="#212529">with a perfect score.</text>
				<text x="400" y="450" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="16" fill="#6c757d">Date: ${currentDate}</text>
				<text x="400" y="520" text-anchor="middle" font-family="${CERT_FONT_FAMILY}" font-size="14" fill="#6c757d">Certificate ID: ${certificateId}</text>
			</svg>
		`;
    }

    // Convert SVG to PNG using Sharp
    console.log(`[${reqId || 'cert'}] Rendering SVG to PNG via sharp…`);
    let buffer;
    try {
        buffer = await withTimeout(
            sharp(Buffer.from(svgToRender))
                .png()
                .toBuffer(),
            15000,
            'sharp.toBuffer'
        );
    } catch (e) {
        console.error(`[${reqId || 'cert'}] Sharp render failed: ${e.message}`);
        throw e;
    }
    console.log(`[${reqId || 'cert'}] Rendered PNG size: ${buffer.length} bytes`);

    return { buffer, certificateId };
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/complete', (req, res) => {
    res.sendFile(path.join(__dirname, 'complete.html'));
});

// API endpoint to get quiz questions
app.get('/api/quiz', (req, res) => {
    res.json({ title: quizTitle, questions: quizQuestions });
});

// API endpoint to submit quiz answers
app.post('/api/submit-quiz', async (req, res) => {
    try {
        const { name, answers } = req.body;
        const reqId = req._reqId || 'submit';
        const safeName = sanitizeUserName(name);
        console.log(`[${reqId}] Submit received. Name(len=${(name || '').length})->Safe(len=${safeName.length}), answers length: ${Array.isArray(answers) ? answers.length : 'n/a'}, expected: ${quizQuestions.length}`);

        if (!safeName || !answers || answers.length !== quizQuestions.length) {
            return res.status(400).json({
                success: false,
                message: 'Valid name and all answers are required'
            });
        }

        // Check answers
        let correctAnswers = 0;
        for (let i = 0; i < quizQuestions.length; i++) {
            if (answers[i] === quizQuestions[i].correct) {
                correctAnswers++;
            }
        }

        const isPerfect = correctAnswers === quizQuestions.length;
        console.log(`[${reqId}] Graded quiz. Correct: ${correctAnswers}/${quizQuestions.length}. Perfect: ${isPerfect}`);

        if (!isPerfect) {
            console.log(`[${reqId}] Not perfect. Returning early.`);
            return res.json({
                success: true,
                perfect: false,
                score: correctAnswers,
                total: quizQuestions.length,
                message: `You got ${correctAnswers} out of ${quizQuestions.length} correct. Try again for a perfect score!`
            });
        }

        // Generate certificate
        console.log(`[${reqId}] Generating certificate…`);
        const { buffer: certBuffer, certificateId } = await generateCertificate(safeName, quizTitle, quizTemplate || CERT_TEMPLATE, reqId);
        const certFilename = `${certificateId}.png`;
        const certPath = path.join(__dirname, certFilename);
        await fs.writeFile(certPath, certBuffer);
        console.log(`[${reqId}] Wrote certificate file: ${certPath} (${certBuffer.length} bytes)`);

        // Upload certificate file (creates collection if it doesn't exist)
        const collectionName = 'Cert Demo';
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', certBuffer, {
            filename: certFilename,
            contentType: 'image/png'
        });

        console.log(`[${reqId}] Uploading certificate… filename=${certFilename}, collection="${collectionName}"`);

        let fileHash = 'unknown';

        try {
            const uploadUrl = `${API_BASE_URL}/webhook/${API_KEY}`;
            console.log(`[${reqId}] POST ${uploadUrl}`);
            const response = await axios.post(uploadUrl, formData, {
                headers: {
                    'secret-key': API_SECRET,
                    'group-id': collectionName,
                    'network': API_NETWORK,
                    ...formData.getHeaders() // Include FormData headers
                }
            });
            console.log(`[${reqId}] Upload response status: ${response.status}`);
            try {
                console.log(`[${reqId}] Upload response data keys: ${Object.keys(response.data || {}).join(', ')}`);
            } catch (_) { }
            fileHash = response.data?.hash || 'unknown';

            // Attempt to delete local file after successful upload
            try {
                await fs.unlink(certPath);
                console.log(`[${reqId}] Local certificate deleted: ${certFilename}`);
            } catch (e) {
                console.warn(`[${reqId}] Could not delete local certificate file: ${e.message}`);
            }
        } catch (uploadError) {
            console.error(`[${reqId}] Upload failed: ${uploadError.message}`);
            if (uploadError.response) {
                console.error(`[${reqId}] Upload error status: ${uploadError.response.status}`);
                try {
                    console.error(`[${reqId}] Upload error data: ${JSON.stringify(uploadError.response.data)}`);
                } catch (_) { }
            }
            try {
                await fs.unlink(certPath);
                console.log(`[${reqId}] Local certificate deleted after failed upload: ${certFilename}`);
            } catch (e) {
                console.warn(`[${reqId}] Could not delete local certificate file after failed upload: ${e.message}`);
            }
            return res.status(500).json({
                success: false,
                message: 'Failed to upload certificate',
                error: uploadError.message
            });
        }

        // Stamp the collection after uploading the certificate
        try {
            const stampUrl = `${API_BASE_URL}/webhook/${API_KEY}`;
            console.log(`[${reqId}] Patching collection (stamp)… ${stampUrl}`);
            const stampResponse = await axios.patch(stampUrl, {}, {
                headers: {
                    'Content-Type': 'application/json',
                    'secret-key': API_SECRET,
                    'group-id': collectionName,
                    'network': API_NETWORK
                }
            });

            if (stampResponse.status === 200) {
                console.log(`[${reqId}] Collection stamped successfully`);
            } else {
                console.error(`[${reqId}] Failed to stamp collection: ${stampResponse.status}`);
            }
        } catch (error) {
            console.error(`[${reqId}] Failed to stamp collection: ${error.message}`);
        }

        console.log(`[${reqId}] Sending success response. fileHash=${fileHash}`);
        res.json({
            success: true,
            perfect: true,
            score: correctAnswers,
            total: quizQuestions.length,
            message: 'Perfect score! Your certificate has been generated and uploaded.',
            fileHash: fileHash
        });

    } catch (error) {
        const reqId = req._reqId || 'submit';
        console.error(`[${reqId}] Quiz submission error: ${error.message}`);
        if (error.stack) console.error(error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to process quiz submission',
            error: error.message
        });
    }
});

// API endpoint to get file info from group (includes gatewayurl)
app.get('/api/file-info/:hash', async (req, res) => {
    try {
        const { hash } = req.params;

        if (!hash) {
            return res.status(400).json({
                success: false,
                message: 'File hash is required'
            });
        }

        // Get file info from group (includes gatewayurl)
        const response = await axios.get(`${API_BASE_URL}/webhook/${API_KEY}`, {
            headers: {
                'secret-key': API_SECRET,
                'network': API_NETWORK,
                'group-id': 'Cert Demo'
            }
        });

        if (response.status !== 200) {
            return res.status(response.status).json({
                success: false,
                message: 'Failed to get collection files',
                error: `HTTP ${response.status}`
            });
        }

        const data = response.data;

        if (!data.files) {
            return res.status(500).json({
                success: false,
                message: 'Invalid response format',
                error: 'No files array in response'
            });
        }

        // Find the specific file by hash
        const targetFile = data.files.find(file => file.hash === hash);

        if (!targetFile) {
            return res.status(404).json({
                success: false,
                message: 'File not found in collection',
                error: 'File hash not found in Cert Demo collection'
            });
        }

        res.json({
            success: true,
            data: targetFile
        });

    } catch (error) {
        console.error('File info check error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get file info',
            error: error.message
        });
    }
});

// API endpoint to check file status (blockchain details)
app.get('/api/file-status/:hash', async (req, res) => {
    try {
        const { hash } = req.params;

        if (!hash) {
            return res.status(400).json({
                success: false,
                message: 'File hash is required'
            });
        }

        // Get specific file status with blockchain info and export links
        const response = await axios.get(`${API_BASE_URL}/webhook/${API_KEY}`, {
            headers: {
                'secret-key': API_SECRET,
                'network': API_NETWORK,
                'hash': hash,
                'group-id': 'Cert Demo',
                'export-links': 'true'
            }
        });

        if (response.status !== 200) {
            return res.status(response.status).json({
                success: false,
                message: 'Failed to get file status',
                error: `HTTP ${response.status}`
            });
        }

        const data = response.data;

        res.json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('File status check error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get file status',
            error: error.message
        });
    }
});

// Removed /ipfs proxy route; clients should use Pinata gateway URLs directly

app.listen(PORT, () => {
    console.log(`Quiz Certificate Demo running on port http://localhost:${PORT}`);
    console.log(`API Key: ${API_KEY ? 'Configured' : 'Missing'}`);
    console.log(`API Secret: ${API_SECRET ? 'Configured' : 'Missing'}`);
    console.log(`Network: ${API_NETWORK}`);
    console.log(`Certificate font family: ${CERT_FONT_FAMILY}`);
    // Basic runtime font check hint
    console.log('If certificate text appears as boxes, install system fonts and fontconfig. On Alpine run: npm run fix:fonts');
}); 