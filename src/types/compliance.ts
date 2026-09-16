/**
 * Legal Metrology (Packaged Commodities) Rules, 2011 Compliance Data Types
 */

export type ComplianceVerdict = 'COMPLIANT' | 'NON_COMPLIANT' | 'SERIOUS_VIOLATION' | 'CONDITIONAL_PASS';

export type RuleSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

export type RuleStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';

export type UserRole = 'INSPECTOR' | 'CONTROLLER' | 'MANUFACTURER_AUDITOR';

export interface BoundingBox {
  ymin: number; // 0 to 1000 or percentage
  xmin: number;
  ymax: number;
  xmax: number;
  label?: string;
}

export interface DeclarationField {
  detected: boolean;
  value: string;
  rawText?: string;
  isCompliant: boolean;
  violationReason?: string;
  remedy?: string;
  boundingBox?: BoundingBox;
}

export interface NetQuantityDeclaration extends DeclarationField {
  numericValue?: number;
  declaredUnit?: string;
  standardMetricUnit?: string;
  isStandardUnit: boolean;
  hasProhibitedQualifiers: boolean; // e.g. "approx", "min", "when packed"
  unitSalePriceDeclared?: boolean;
}

export interface MrpDeclaration extends DeclarationField {
  mrpAmount?: number;
  currencySymbolDeclared: boolean; // ₹ or Rs.
  inclusiveOfAllTaxes: boolean;
  hasTaxesExtraViolation: boolean; // "taxes extra" is illegal
  hasOverwritingOrTampering?: boolean;
}

export interface UnitSalePriceDeclaration extends DeclarationField {
  unitPriceAmount?: number;
  unitBasis?: string; // e.g. "per g", "per kg", "per ml", "per litre", "per N"
  isCalculationConsistent?: boolean;
  expectedUnitPrice?: string;
}

export interface ConsumerCareDeclaration extends DeclarationField {
  contactPersonDesignation?: string;
  fullAddress?: string;
  telephoneNumber?: string;
  emailId?: string;
  hasMissingMandatoryFields: boolean;
  missingFieldsList: string[];
}

export interface ExtractedDeclarations {
  commodityName: DeclarationField;
  manufacturerDetails: DeclarationField & { pinCodeDeclared?: boolean };
  packerDetails?: DeclarationField & { pinCodeDeclared?: boolean };
  importerDetails?: DeclarationField & { countryOfOrigin?: string };
  countryOfOrigin: DeclarationField & { country?: string };
  netQuantity: NetQuantityDeclaration;
  mrp: MrpDeclaration;
  unitSalePrice: UnitSalePriceDeclaration;
  dateOfManufactureOrPacking: DeclarationField & { monthYear?: string; isBestBeforeStated?: boolean };
  consumerCare: ConsumerCareDeclaration;
  batchOrLotNumber?: DeclarationField;
  fssaiNumber?: DeclarationField;
  barcode?: { value: string; format: string };
  qrCode?: { value: string; type?: string };
  dimensionsOrSize?: DeclarationField;
  barcodeVerification?: BarcodeVerificationResult;
  smartQrVerification?: SmartQrVerificationResult;
}

export interface BarcodeVerificationResult {
  detected: boolean;
  rawCode: string;
  barcodeNumber?: string;
  symbology: 'EAN_13' | 'UPC_A' | 'EAN_8' | 'CODE_128' | 'DATA_MATRIX' | 'UNKNOWN';
  prefix: string;
  countryOfIssuance: string;
  isCheckDigitValid: boolean;
  calculatedCheckDigit?: number;
  actualCheckDigit?: number;
  textDeclaredOrigin?: string;
  provenanceMatchStatus: 'VERIFIED_MATCH' | 'SUSPECTED_MISMATCH' | 'THIRD_PARTY_LICENSEE' | 'UNVERIFIABLE';
  complianceVerdict: 'COMPLIANT' | 'VIOLATION' | 'WARNING';
  observation: string;
  legalCitation: string;
  mathBreakdown?: {
    digits: number[];
    weights: number[];
    products: number[];
    weightedSum: number;
    moduloRemainder: number;
    calculatedCheckDigit: number;
    formulaExplanation: string;
  };
}

export interface SmartQrVerificationResult {
  detected: boolean;
  rawPayload: string;
  payloadType: 'URL' | 'GS1_DIGITAL_LINK' | 'FSSAI_VERIFY' | 'PLAIN_TEXT' | 'UNKNOWN';
  isUrlReachable?: boolean;
  httpStatus?: number;
  destinationUrl?: string;
  isLoginPaywalled?: boolean;
  electronicExemptionApplicable: boolean;
  digitalDeclarationsFound?: {
    manufacturerNameAndAddress?: boolean;
    commonGenericName?: boolean;
    sizeAndDimensions?: boolean;
    countryOfOrigin?: boolean;
    consumerCareDetails?: boolean;
    warrantyOrCustomerGuide?: boolean;
  };
  mandatoryPhysicalLabelPreserved: {
    mrpPrintedOnPack: boolean;
    netQtyPrintedOnPack: boolean;
    commodityNamePrintedOnPack: boolean;
    consumerCarePrintedOnPack: boolean;
  };
  complianceStatus:
    | 'COMPLIANT_WITH_EXEMPTION'
    | 'NON_COMPLIANT_BROKEN_LINK'
    | 'ILLEGAL_PHYSICAL_OMISSION'
    | 'NOT_APPLICABLE'
    | 'PENDING_VERIFICATION';
  observation: string;
  legalCitation: string;
}

export interface RuleEvaluationItem {
  ruleId: string;
  ruleTitle: string;
  ruleClause: string;
  actSection: string; // e.g., "Section 18 read with Section 36(1), Legal Metrology Act, 2009"
  status: RuleStatus;
  severity: RuleSeverity;
  observation: string;
  legalRequirement: string;
  suggestedCorrectiveAction: string;
  penalProvision: string;
}

export interface ReadabilityAnalysis {
  estimatedPdpAreaSqCm: number;
  measuredFontHeightMm: number;
  requiredMinFontHeightMm: number;
  isFontHeightCompliant: boolean;
  contrastRatio: number; // e.g. 7.5 : 1
  contrastScore: 'EXCELLENT' | 'ACCEPTABLE' | 'POOR';
  clarityAndSharpness: number; // 0 - 100
  obscuredByGraphics: boolean;
  plainLanguageVerdict: string;
}

export interface InspectionResult {
  id: string;
  timestamp: string;
  productName: string;
  brandName: string;
  category: 'FOOD_AND_BEVERAGES' | 'PERSONAL_CARE' | 'HOUSEHOLD' | 'ELECTRONICS' | 'PHARMA_OTC' | 'COMMODITIES';
  packageType: 'RECTANGULAR_BOX' | 'POUCH_OR_SACHET' | 'BOTTLE_OR_CAN' | 'TUBE' | 'WRAPPER';
  images: {
    pdpImage?: string;
    backPanelImage?: string;
    sidePanelImage?: string;
    mrpStampImage?: string;
    supportingImages?: string[];
  };
  overallVerdict: ComplianceVerdict;
  complianceScore: number; // 0 - 100
  declarations: ExtractedDeclarations;
  rulesEvaluated: RuleEvaluationItem[];
  readability: ReadabilityAnalysis;
  violationsCount: {
    critical: number;
    major: number;
    minor: number;
    warnings: number;
  };
  inspectorInfo: {
    name: string;
    badgeId: string;
    jurisdiction: string;
    inspectionLocation: string;
  };
  caseStatus?: 'SURVEILLANCE' | 'NOTICE_ISSUED' | 'HEARING_SCHEDULED' | 'COMPOUNDED' | 'DISMISSED';
  annotations?: LabelAnnotation[];
  legalNoticeGenerated?: boolean;
  noticeNumber?: string;
  notes?: string;
}

export interface LabelAnnotation {
  id: string;
  label: string;
  fieldKey: string;
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
  isCompliant: boolean;
  ruleClause: string;
  detectedText: string;
  violationMessage?: string;
}

export interface WeightToleranceCheck {
  declaredQtyGrams: number;
  actualGrossWeightGrams: number;
  tareWeightGrams: number;
  actualNetWeightGrams: number;
  deficiencyGrams: number;
  maxPermissibleErrorGrams: number;
  isCompliant: boolean;
  percentageDeficiency: number;
  status: 'WITHIN_TOLERANCE' | 'DEFICIENT_UNDERWEIGHT' | 'EXCESS';
}

export interface InspectionNoticeDraft {
  noticeId: string;
  date: string;
  subject: string;
  statutoryReference: string;
  violatorDetails: {
    firmName: string;
    brand: string;
    address: string;
  };
  offenceDescription: string[];
  applicableSections: string[];
  remedialPeriodDays: number;
  penaltyWarning: string;
  issuingAuthority: {
    name: string;
    designation: string;
    office: string;
  };
}
