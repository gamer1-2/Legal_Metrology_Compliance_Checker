import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzePackageWithGemini, decodeBarcodeWithGemini } from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS so Android native APK / mobile devices on local Wi-Fi can connect
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      additionalContext,
      backPanelBase64,
      sidePanelBase64,
      macroBase64,
      additionalImages,
      dimensions,
    } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    const options = {
      ...additionalContext,
      backPanelBase64: backPanelBase64 || additionalContext?.backPanelBase64,
      sidePanelBase64: sidePanelBase64 || additionalContext?.sidePanelBase64,
      macroBase64: macroBase64 || additionalContext?.macroBase64,
      additionalImages: additionalImages || additionalContext?.additionalImages,
      dimensions: dimensions || additionalContext?.dimensions,
    };
    const result = await analyzePackageWithGemini(imageBase64, mimeType || 'image/jpeg', options);
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Error in /api/analyze:', err);
    res.status(500).json({ success: false, error: err?.message || 'Server analysis error' });
  }
});

app.post('/api/verify-qr-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return res.status(400).json({ error: 'Valid URL starting with http:// or https:// is required' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const targetRes = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LMPC-Inspector/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const status = targetRes.status;
    const isAccessible = status >= 200 && status < 400;
    const text = await targetRes.text();
    const cleanText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const detectedDeclarations = {
      manufacturerNameAndAddress: /manufactur|pack(?:ed|er)|import(?:ed|er)|factory|address|pin\s*code|mfg|unit/i.test(cleanText),
      commonGenericName: /product|generic|commodity|model|item|description/i.test(cleanText),
      sizeAndDimensions: /dimension|size|weight|net\s*wt|volum|capacity|mm|cm|kg|g|ml|litre/i.test(cleanText),
      countryOfOrigin: /origin|made\s*in|country/i.test(cleanText),
      consumerCareDetails: /customer|care|toll|support|email|helpline|contact|phone/i.test(cleanText),
      warrantyOrCustomerGuide: /warranty|guarantee|manual|user\s*guide|instructions/i.test(cleanText),
    };

    res.json({
      ok: true,
      httpStatus: status,
      isAccessible,
      detectedDeclarations,
      sampleSnippet: text.substring(0, 300).replace(/<[^>]+>/g, ' ').trim(),
    });
  } catch (err: any) {
    console.error('Error verifying QR URL:', err);
    res.status(500).json({
      ok: false,
      httpStatus: 0,
      isAccessible: false,
      error: err?.message || 'Failed to fetch QR destination URL',
    });
  }
});

app.post('/api/decode-barcode', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ detected: false, error: 'imageBase64 string is required' });
    }

    const result = await decodeBarcodeWithGemini(imageBase64);
    res.json(result);
  } catch (err: any) {
    console.error('Error decoding barcode via Gemini:', err);
    res.status(500).json({
      detected: false,
      error: err?.message || 'Failed to decode barcode from image',
    });
  }
});

// Serve static files from dist in production
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`LMPC Compliance Checker server running on http://0.0.0.0:${PORT}`);
});
server.setTimeout(120000);
server.keepAliveTimeout = 65000;
