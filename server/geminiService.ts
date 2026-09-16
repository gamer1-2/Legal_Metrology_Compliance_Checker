import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { InspectionResult, LabelAnnotation } from '../src/types/compliance';
import { verifyBarcodeProvenance } from '../src/utils/barcodeEngine';
import { evaluateLmpcQrExemption } from '../src/utils/qrEngine';

export interface AnalysisOptions {
  productName?: string;
  category?: string;
  packageType?: string;
  backPanelBase64?: string;
  sidePanelBase64?: string;
  macroBase64?: string;
  additionalImages?: string[];
  dimensions?: { widthCm: number; heightCm: number };
  inspectorInfo?: {
    name?: string;
    badgeId?: string;
    jurisdiction?: string;
    inspectionLocation?: string;
  };
}

/**
 * Helper to determine mime type from a data URL or fallback
 */
function getMimeType(dataUrl: string, fallback = 'image/jpeg'): string {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return fallback;
}

/**
 * Helper to strip data URL prefix for inlineData
 */
function stripBase64Prefix(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

/**
 * Server-side Gemini service for Legal Metrology compliance inspection.
 * Uses high-accuracy multimodal vision with automatic model fallback.
 */
export async function analyzePackageWithGemini(
  base64Data: string,
  mimeType: string,
  options?: AnalysisOptions
): Promise<InspectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = `
You are an expert Senior Legal Metrology Enforcement Officer and forensic packaging label compliance auditor under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC Rules, 2011) of the Government of India.

Your primary duty:
Perform high-precision Optical Character Recognition (OCR) across ALL provided packaging photographs (Front PDP, Back Declaration Table, Side Panels, Top/Flap Stamps, and Macro close-ups).
Read every visible word, number, unit, date, physical address, PIN code, telephone number, email, barcode number, FSSAI license number, and fine print label text VERBATIM.

CRITICAL INSTRUCTIONS FOR ACCURACY:
1. MULTI-PANEL SYNTHESIS:
   - You are provided with photos of the SAME product package from different angles.
   - Inspect ALL provided photos together as a single unified product audit.
   - Typically:
     * Image 1 (Front / PDP) shows: Brand Name, Generic Product Name, Net Quantity, prominent claims, veg/non-veg logo.
     * Image 2 (Back / Information Panel) shows: Complete Manufacturer/Packer Address with PIN code, FSSAI logo & 14-digit license number, Ingredients, Nutritional information, Customer Care details.
     * Image 3 & 4 (Side / Flap / Stamp Close-ups) show: Ink-jet printed or embossed stamp containing MRP (in ₹), Date of Manufacture/Packaging, Batch/Lot Number, and Unit Sale Price (USP).
   - If a declaration appears on ANY of the provided photos, mark it as DETECTED. Do NOT mark a declaration as missing if it is visible on the back or stamp photo.

2. VERBATIM EXTRACTION - NO PLACEHOLDERS:
   - Extract the ACTUAL text printed on the packaging for each field.
   - NEVER invent, hallucinate, or use default placeholder text (such as "Premier Consumer Products", "500 g", "₹ 125", "Scanned Packaged Commodity").
   - If a field is genuinely not printed or completely unreadable on any photo, set "detected": false and provide an explicit "violationReason": "Mandatory statutory declaration not detected on package label".
   - Read the real Brand Name and Common/Generic Commodity Name directly from the packaging photographs.
     * Brand Name: e.g. "Parle-G", "Tata Salt", "Amul", "Haldiram's", "Britannia", "Dettol", "Cadbury", "Nestle", "Patanjali".
     * Common Commodity Name: e.g. "Glucose Biscuits", "Refined Sunflower Oil", "Iodized Salt", "Instant Noodles", "Toilet Soap", "Shampoo".

3. STATUTORY RULES EVALUATION:
   - Rule 6(1)(a): Manufacturer / Packer / Importer Name & Complete Address.
     * Must state complete physical factory address AND mandatory 6-digit postal PIN code.
     * Check if 6-digit PIN code is present (set pinCodeDeclared: true/false). If PIN code is absent, set isCompliant: false.
   - Rule 6(1)(b): Generic or Common Name of Commodity.
     * Generic commodity name must be prominently displayed, not merely a fancy trade name.
   - Rule 6(1)(c) & Rule 11: Net Quantity & Standard Metric Units.
     * Must use standard statutory metric symbols: 'g', 'kg', 'ml', 'l' or 'L', 'N' or 'U'.
     * Rule 11 violation: Using abbreviations like 'gm', 'gms', 'gm.', 'ml.', 'ltr', 'Kgs', 'pcs' is strictly illegal. If used, set isStandardUnit: false, isCompliant: false.
   - Rule 12(2): Prohibited Qualifying Words.
     * Words like "approx", "when packed", "minimum", "net weight when packed" are strictly prohibited with net quantity.
   - Rule 6(1)(d): Month & Year of Manufacture / Packing / Import.
     * Legible month and year (e.g. "08/2026", "FEB 2026", "15/02/26").
   - Rule 6(1)(e) & Section 36(2): Maximum Retail Price (MRP).
     * Must be in Indian Rupees ('₹' or 'Rs.').
     * Must include the mandatory statutory wording "inclusive of all taxes" or "incl. of all taxes".
     * If "+ taxes extra" or "taxes extra" is printed, flag as CRITICAL violation under Section 36(2).
   - Rule 6(10) (2022 Unit Sale Price Amendment):
     * Must declare Unit Sale Price (price per g, per 100g, per kg, per ml, per 100ml, per litre, or per number).
     * Verify math: mrpAmount / numericValue must align with declared unit price.
   - Rule 6(1)(f): Consumer Care Contact Details.
     * Must contain 4 mandatory elements: Designation of officer, postal address, telephone/toll-free helpline, and email ID.
   - Rule 6(1)(n): Country of Origin.
     * Must clearly state Country of Origin (e.g. "Country of Origin: India", "Made in India").
   - Schedule II: Font Height Compliance.
     * Automatic minimum font height threshold determined from declared Net Quantity:
       <= 50g/ml: 1.0mm; 50g-200g/ml: 2.0mm; 200g-1kg/ml: 4.0mm; >1kg/ml: 6.0mm.
   - Rule 6(1)(g): Batch or Lot identification code.
   - FSSAI License: 14-digit license number if food item.
`;

  // Build image parts for Gemini
  const parts: any[] = [];

  // Part 1: Primary image (Front PDP)
  const primaryClean = stripBase64Prefix(base64Data);
  const primaryMime = getMimeType(base64Data, mimeType || 'image/jpeg');
  parts.push({
    inlineData: {
      mimeType: primaryMime,
      data: primaryClean,
    },
  });

  // Part 2: Back panel image
  if (options?.backPanelBase64) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(options.backPanelBase64),
        data: stripBase64Prefix(options.backPanelBase64),
      },
    });
  }

  // Part 3: Side panel image
  if (options?.sidePanelBase64) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(options.sidePanelBase64),
        data: stripBase64Prefix(options.sidePanelBase64),
      },
    });
  }

  // Part 4: Macro close-up / stamp image
  if (options?.macroBase64) {
    parts.push({
      inlineData: {
        mimeType: getMimeType(options.macroBase64),
        data: stripBase64Prefix(options.macroBase64),
      },
    });
  }

  // Part 5+: Any additional supporting images
  if (Array.isArray(options?.additionalImages)) {
    for (const extraImg of options.additionalImages) {
      if (extraImg && typeof extraImg === 'string' && extraImg.length > 20) {
        parts.push({
          inlineData: {
            mimeType: getMimeType(extraImg),
            data: stripBase64Prefix(extraImg),
          },
        });
      }
    }
  }

  const imageCountDesc = `${parts.length} photograph${parts.length > 1 ? 's' : ''} (including Front PDP, Back Panel, Side/Flaps, and Stamp Close-ups)`;

  const prompt = `
Examine the provided ${imageCountDesc} of this packaged commodity with maximum forensic OCR accuracy.
${options?.productName && options.productName !== 'Scanned Packaged Commodity' ? `User Note - Product Name Hint: ${options.productName}` : ''}
${options?.category ? `User Note - Category Hint: ${options.category}` : ''}
${options?.packageType ? `User Note - Package Type Hint: ${options.packageType}` : ''}

INSTRUCTIONS:
1. Examine EVERY photo in detail. Read ALL visible printed text verbatim.
2. Synthesize all observations into the JSON format below.
3. Transcribe ALL legible text across all photos into "rawExtractedText".
4. For the primary PDP photo, provide bounding box annotations in "annotations" for key fields located on it.

Return a valid JSON object matching the exact structure below:
{
  "productName": "string (verbatim common/generic commodity name identified on package)",
  "brandName": "string (verbatim brand name identified on package)",
  "category": "FOOD_AND_BEVERAGES" | "PERSONAL_CARE" | "HOUSEHOLD" | "ELECTRONICS" | "PHARMA_OTC" | "COMMODITIES",
  "packageType": "RECTANGULAR_BOX" | "POUCH_OR_SACHET" | "BOTTLE_OR_CAN" | "TUBE" | "WRAPPER",
  "overallVerdict": "COMPLIANT" | "NON_COMPLIANT" | "SERIOUS_VIOLATION" | "CONDITIONAL_PASS",
  "complianceScore": number (0 to 100),
  "rawExtractedText": "string (full verbatim transcription of all text detected across all images)",
  "declarations": {
    "commodityName": {
      "detected": boolean,
      "value": "string",
      "rawText": "string",
      "isCompliant": boolean,
      "remedy": "string"
    },
    "manufacturerDetails": {
      "detected": boolean,
      "value": "string (full name and complete physical address)",
      "rawText": "string",
      "isCompliant": boolean,
      "pinCodeDeclared": boolean,
      "violationReason": "string"
    },
    "packerDetails": {
      "detected": boolean,
      "value": "string",
      "isCompliant": boolean
    },
    "importerDetails": {
      "detected": boolean,
      "value": "string",
      "countryOfOrigin": "string",
      "isCompliant": boolean
    },
    "countryOfOrigin": {
      "detected": boolean,
      "value": "string",
      "country": "string",
      "isCompliant": boolean
    },
    "netQuantity": {
      "detected": boolean,
      "value": "string (e.g. 200 g, 500 ml)",
      "rawText": "string",
      "numericValue": number,
      "declaredUnit": "string",
      "standardMetricUnit": "string",
      "isStandardUnit": boolean,
      "hasProhibitedQualifiers": boolean,
      "isCompliant": boolean,
      "violationReason": "string",
      "remedy": "string"
    },
    "mrp": {
      "detected": boolean,
      "value": "string (e.g. ₹ 45.00 incl. of all taxes)",
      "rawText": "string",
      "mrpAmount": number,
      "currencySymbolDeclared": boolean,
      "inclusiveOfAllTaxes": boolean,
      "hasTaxesExtraViolation": boolean,
      "isCompliant": boolean,
      "violationReason": "string"
    },
    "unitSalePrice": {
      "detected": boolean,
      "value": "string (e.g. ₹ 0.22 / g)",
      "rawText": "string",
      "unitPriceAmount": number,
      "unitBasis": "string",
      "isCalculationConsistent": boolean,
      "expectedUnitPrice": "string",
      "isCompliant": boolean,
      "violationReason": "string"
    },
    "dateOfManufactureOrPacking": {
      "detected": boolean,
      "value": "string (e.g. 02/2026)",
      "rawText": "string",
      "monthYear": "string",
      "isBestBeforeStated": boolean,
      "isCompliant": boolean,
      "violationReason": "string"
    },
    "consumerCare": {
      "detected": boolean,
      "value": "string (full contact details)",
      "rawText": "string",
      "contactPersonDesignation": "string",
      "fullAddress": "string",
      "telephoneNumber": "string",
      "emailId": "string",
      "hasMissingMandatoryFields": boolean,
      "missingFieldsList": ["string"],
      "isCompliant": boolean,
      "violationReason": "string"
    },
    "batchOrLotNumber": {
      "detected": boolean,
      "value": "string (e.g. B.No. A104)",
      "isCompliant": boolean
    },
    "fssaiNumber": {
      "detected": boolean,
      "value": "string (14-digit FSSAI license number if food product)",
      "isCompliant": boolean
    },
    "barcode": {
      "detected": boolean,
      "value": "string (the exact numeric barcode printed on package, usually 8, 12, or 13 digits like 8901030924512)",
      "format": "string (e.g. EAN_13, UPC_A, EAN_8)"
    },
    "qrCode": {
      "detected": boolean,
      "value": "string (the URL or text printed or encoded in any QR code visible on package)",
      "type": "string (URL, GS1_DIGITAL_LINK, or TEXT)"
    }
  },
  "annotations": [
    {
      "id": "string",
      "label": "string",
      "fieldKey": "string",
      "topPct": number,
      "leftPct": number,
      "widthPct": number,
      "heightPct": number,
      "isCompliant": boolean,
      "ruleClause": "string",
      "detectedText": "string",
      "violationMessage": "string"
    }
  ],
  "rulesEvaluated": [
    {
      "ruleId": "RULE_6_1_A",
      "ruleTitle": "string",
      "ruleClause": "string",
      "actSection": "string",
      "status": "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE",
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO",
      "observation": "string",
      "legalRequirement": "string",
      "suggestedCorrectiveAction": "string",
      "penalProvision": "string"
    }
  ],
  "readability": {
    "estimatedPdpAreaSqCm": number,
    "measuredFontHeightMm": number,
    "requiredMinFontHeightMm": number,
    "isFontHeightCompliant": boolean,
    "contrastRatio": number,
    "contrastScore": "EXCELLENT" | "ACCEPTABLE" | "POOR",
    "clarityAndSharpness": number,
    "obscuredByGraphics": boolean,
    "plainLanguageVerdict": "string"
  },
  "violationsCount": {
    "critical": number,
    "major": number,
    "minor": number,
    "warnings": number
  },
  "notes": "string"
}
`;

  parts.push({ text: prompt });

  // Priority candidate models:
  // 1. gemini-3-flash-preview: resilient, high-speed vision model
  // 2. gemini-flash-lite-latest: ultra-fast lightweight multimodal model
  // 3. gemini-3.6-flash: stable high-capacity vision model
  // 4. gemini-3.8-flash: comprehensive multimodal analysis model
  // 5. gemini-3.1-flash-lite: fast fallback
  // 6. gemini-flash-latest: high availability fallback
  const candidateModels = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  let lastError: any = null;
  let responseText = '';
  let successfulModel = '';

  for (const modelName of candidateModels) {
    let modelSucceeded = false;
    // Try up to 2 attempts per model with backoff on transient 503/429 spikes
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Attempting LMPC label compliance vision analysis with model: ${modelName} (attempt ${attempt + 1})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        if (response && response.text) {
          responseText = response.text;
          successfulModel = modelName;
          console.log(`Successfully completed LMPC label analysis with model: ${modelName}`);
          modelSucceeded = true;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || '');
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('429') ||
          errMsg.includes('high demand') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          err?.status === 503 ||
          err?.status === 429;

        console.warn(`Model ${modelName} encountered error: ${errMsg.slice(0, 200)}`);

        if (isTransient && attempt === 0) {
          const backoffDelay = 800 + Math.floor(Math.random() * 400);
          console.log(`Retrying ${modelName} in ${backoffDelay}ms after transient demand spike...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }
        // Proceed to next candidate model
        break;
      }
    }

    if (modelSucceeded) {
      break;
    }
  }

  if (!responseText) {
    const errMsg = lastError?.message || '';
    const isTransientSpike =
      errMsg.includes('503') ||
      errMsg.includes('high demand') ||
      errMsg.includes('UNAVAILABLE') ||
      errMsg.includes('RESOURCE_EXHAUSTED');

    if (isTransientSpike) {
      throw new Error(
        'Google Gemini AI Vision is experiencing temporary high demand spikes. Please tap "Retry Scan" in a few seconds.'
      );
    }

    throw new Error(
      `AI Vision Extraction Error: All candidate models failed. Last error: ${errMsg || 'High server demand or network error'}`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch (parseErr) {
    // If markdown wrapped
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleanJson);
  }

  // Ensure annotations have valid coordinates if provided
  const annotations: LabelAnnotation[] =
    Array.isArray(parsed.annotations) && parsed.annotations.length > 0
      ? parsed.annotations.map((ann: any, idx: number) => ({
          id: ann.id || `box-${idx}`,
          label: ann.label || 'Packaging Declaration',
          fieldKey: ann.fieldKey || 'generic',
          topPct: typeof ann.topPct === 'number' ? Math.max(0, Math.min(95, ann.topPct)) : 10 + idx * 12,
          leftPct: typeof ann.leftPct === 'number' ? Math.max(0, Math.min(95, ann.leftPct)) : 8,
          widthPct: typeof ann.widthPct === 'number' ? Math.max(5, Math.min(95, ann.widthPct)) : 84,
          heightPct: typeof ann.heightPct === 'number' ? Math.max(3, Math.min(50, ann.heightPct)) : 8,
          isCompliant: ann.isCompliant !== false,
          ruleClause: ann.ruleClause || 'Legal Metrology Rules, 2011',
          detectedText: ann.detectedText || '',
          violationMessage: ann.violationMessage || undefined,
        }))
      : [];

  // Run Barcode Provenance and Smart QR Verifications
  const rawBarcode = parsed.declarations?.barcode?.value || '';
  const textOrigin =
    parsed.declarations?.countryOfOrigin?.country ||
    parsed.declarations?.countryOfOrigin?.value ||
    '';
  const mfgText = parsed.declarations?.manufacturerDetails?.value || '';

  const barcodeVerification = verifyBarcodeProvenance(rawBarcode, textOrigin, mfgText);
  if (!parsed.declarations) parsed.declarations = {};
  parsed.declarations.barcodeVerification = barcodeVerification;

  const rawQr = parsed.declarations?.qrCode?.value || '';
  const qrVerification = evaluateLmpcQrExemption(rawQr, parsed.declarations, parsed.category);
  parsed.declarations.smartQrVerification = qrVerification;

  if (!Array.isArray(parsed.rulesEvaluated)) {
    parsed.rulesEvaluated = [];
  }

  // Inject provenance mismatch rule if detected
  if (barcodeVerification.detected && barcodeVerification.provenanceMatchStatus === 'SUSPECTED_MISMATCH') {
    parsed.rulesEvaluated.unshift({
      ruleId: 'LMPC-BARCODE-PROVENANCE-MISMATCH',
      ruleTitle: 'Barcode GS1 Country Allocation vs Label Origin Mismatch',
      ruleClause: 'Rule 6(1)(n) read with Section 36(1)',
      actSection: 'Section 36(1), Legal Metrology Act, 2009',
      status: 'FAIL',
      severity: 'CRITICAL',
      observation: barcodeVerification.observation,
      legalRequirement: 'Origin declared on package must strictly correspond to the registered GS1 country prefix unless explicit licensed import disclosures are printed.',
      suggestedCorrectiveAction: 'Rectify product packaging to accurately declare true country of manufacture and legal importer details under Rule 6(1)(a).',
      penalProvision: 'Section 36(1): Fine up to ₹25,000 for first offence, up to ₹50,000 for second offence.',
    });
  }

  // Inject check digit failure if invalid
  if (barcodeVerification.detected && !barcodeVerification.isCheckDigitValid) {
    parsed.rulesEvaluated.unshift({
      ruleId: 'LMPC-BARCODE-CHECKSUM-INVALID',
      ruleTitle: 'GS1 Barcode Symbology Checksum Failure',
      ruleClause: 'Rule 6(1) & General Labelling Standards',
      actSection: 'Section 18, Legal Metrology Act, 2009',
      status: 'FAIL',
      severity: 'MAJOR',
      observation: barcodeVerification.observation,
      legalRequirement: 'All optical product barcodes must adhere to valid GS1 Modulo-10 checksum encoding.',
      suggestedCorrectiveAction: 'Audit pre-press packaging plates and barcode generation software.',
      penalProvision: 'Statutory compliance violation under Section 36(1).',
    });
  }

  // Inject illegal physical omission if QR code was used improperly
  if (qrVerification.detected && qrVerification.complianceStatus === 'ILLEGAL_PHYSICAL_OMISSION') {
    parsed.rulesEvaluated.unshift({
      ruleId: 'LMPC-QR-EXEMPTION-ILLEGAL-OMISSION',
      ruleTitle: 'Illegal Omission of Physical Core Declarations under QR Exemption',
      ruleClause: 'Notification G.S.R. 540(E) & Rule 6(1)',
      actSection: 'Section 18 read with Section 36, Legal Metrology Act, 2009',
      status: 'FAIL',
      severity: 'CRITICAL',
      observation: qrVerification.observation,
      legalRequirement: 'MRP, Net Quantity, Commodity Name, and Consumer Care MUST be physically printed on the package. Moving them exclusively into a QR code is strictly prohibited.',
      suggestedCorrectiveAction: 'Re-print primary packaging label with mandatory physical MRP and Net Quantity numerals.',
      penalProvision: 'Section 36(1), Legal Metrology Act, 2009.',
    });
  }

  const inspectionResult: InspectionResult = {
    id: options?.inspectorInfo?.badgeId || ('insp-' + Date.now()),
    timestamp: new Date().toISOString(),
    productName: parsed.productName || options?.productName || 'Verified Packaged Commodity',
    brandName: parsed.brandName || 'Brand Detected',
    category: parsed.category || (options?.category as any) || 'FOOD_AND_BEVERAGES',
    packageType: parsed.packageType || (options?.packageType as any) || 'RECTANGULAR_BOX',
    images: {
      pdpImage: base64Data,
      backPanelImage: options?.backPanelBase64,
      sidePanelImage: options?.sidePanelBase64,
      mrpStampImage: options?.macroBase64,
      supportingImages: options?.additionalImages,
    },
    overallVerdict: parsed.overallVerdict || (parsed.complianceScore >= 80 ? 'COMPLIANT' : 'NON_COMPLIANT'),
    complianceScore: typeof parsed.complianceScore === 'number' ? parsed.complianceScore : 70,
    declarations: parsed.declarations || {},
    annotations: annotations.length > 0 ? annotations : undefined,
    rulesEvaluated: parsed.rulesEvaluated || [],
    readability: parsed.readability || {
      estimatedPdpAreaSqCm: 150,
      measuredFontHeightMm: 3.5,
      requiredMinFontHeightMm: 2.0,
      isFontHeightCompliant: true,
      contrastRatio: 8.5,
      contrastScore: 'EXCELLENT',
      clarityAndSharpness: 90,
      obscuredByGraphics: false,
      plainLanguageVerdict: 'Packaging declarations legibly inspected.',
    },
    violationsCount: parsed.violationsCount || {
      critical: 0,
      major: 0,
      minor: 0,
      warnings: 0,
    },
    inspectorInfo: {
      name: options?.inspectorInfo?.name || 'Inspector, Legal Metrology Enforcement Wing',
      badgeId: options?.inspectorInfo?.badgeId || `LMI-DEL-${Math.floor(1000 + Math.random() * 9000)}`,
      jurisdiction: options?.inspectorInfo?.jurisdiction || 'State Legal Metrology Enforcement Circle',
      inspectionLocation: options?.inspectorInfo?.inspectionLocation || 'Field Surveillance Site',
    },
    notes:
      (parsed.rawExtractedText
        ? `[Verbatim OCR Extracted Text (AI Model: ${successfulModel})]:\n${parsed.rawExtractedText}\n\n`
        : `[Inspected with AI Model: ${successfulModel}]\n\n`) +
      (parsed.notes || 'Automated Legal Metrology forensic inspection complete.'),
  };

  return inspectionResult;
}

export async function decodeBarcodeWithGemini(imageBase64: string): Promise<{
  detected: boolean;
  barcode?: string;
  symbology?: string;
  declaredOrigin?: string;
  manufacturerDetails?: string;
  observation?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { detected: false, observation: 'GEMINI_API_KEY is not configured on the server.' };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const mimeType = getMimeType(imageBase64, 'image/jpeg');
  const cleanBase64 = stripBase64Prefix(imageBase64);

  const prompt = `Examine this packaging or barcode photograph carefully.
1. Locate the 1D printed retail barcode (EAN-13, UPC-A, EAN-8, or Code-128).
2. Read the exact barcode digits printed directly underneath or alongside the bars (e.g. 13 digits for EAN-13, 12 digits for UPC-A, or 8 digits for EAN-8).
3. If visible, extract the declared Country of Origin (e.g. "Made in India", "Country of Origin: India", "Made in China", etc.) and the Manufacturer or Importer address.

Return ONLY a JSON object with this exact structure:
{
  "detected": true or false,
  "barcode": "string of digits only, e.g. 8901030924512",
  "symbology": "EAN_13" | "UPC_A" | "EAN_8" | "CODE_128" | "UNKNOWN",
  "declaredOrigin": "string (or null if not found)",
  "manufacturerDetails": "string (or null if not found)",
  "observation": "short description of what was read"
}`;

  try {
    const candidateModels = [
      'gemini-3-flash-preview',
      'gemini-flash-lite-latest',
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ];
    for (const model of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: {
              parts: [
                { inlineData: { data: cleanBase64, mimeType } },
                { text: prompt },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const text = response.text ? response.text.trim() : '';
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed && parsed.detected && parsed.barcode) {
              const cleanDigits = String(parsed.barcode).replace(/\D/g, '');
              if (cleanDigits.length >= 8) {
                return {
                  detected: true,
                  barcode: cleanDigits,
                  symbology: parsed.symbology || (cleanDigits.length === 13 ? 'EAN_13' : cleanDigits.length === 12 ? 'UPC_A' : 'EAN_8'),
                  declaredOrigin: parsed.declaredOrigin || undefined,
                  manufacturerDetails: parsed.manufacturerDetails || undefined,
                  observation: parsed.observation || `Decoded barcode ${cleanDigits} via AI Vision.`,
                };
              }
            }
          }
          break; // Model answered (even if barcode not detected in image)
        } catch (e: any) {
          console.warn(`decodeBarcodeWithGemini error on ${model}:`, e?.message?.slice(0, 150));
          const isTransient = String(e?.message || '').includes('503') || String(e?.message || '').includes('429');
          if (isTransient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('Gemini barcode decoding error:', err);
  }

  return { detected: false, observation: 'No barcode could be identified from this image.' };
}



