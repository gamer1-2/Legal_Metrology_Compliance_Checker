import React, { useState, useRef } from 'react';
import { exportToPdf } from '../utils/pdfExport';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  FileText,
  Printer,
  Download,
  CheckCircle2,
  Scale,
  Eye,
  Building,
  DollarSign,
  Calendar,
  Phone,
  Layers,
  ArrowLeft,
  ExternalLink,
  Package,
  MapPin,
  Barcode,
  QrCode,
  Globe,
  RefreshCw,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { InspectionResult, UserRole } from '../types/compliance';
import { safeExtractSvg } from '../utils/svgHelper';
import { verifyLiveQrEndpoint } from '../utils/qrEngine';
import { verifyBarcodeProvenance } from '../utils/barcodeEngine';

interface ComplianceReportViewProps {
  report: InspectionResult;
  userRole: UserRole;
  onBackToScanner: () => void;
  onOpenNoticeGenerator: () => void;
  onOpenStudio?: () => void;
  onOpenRemediation?: () => void;
  onOpenWeightToleranceTest?: () => void;
}

export const ComplianceReportView: React.FC<ComplianceReportViewProps> = ({
  report,
  userRole,
  onBackToScanner,
  onOpenNoticeGenerator,
  onOpenStudio,
  onOpenRemediation,
  onOpenWeightToleranceTest,
}) => {
  const [activeTab, setActiveTab] = useState<'features' | 'data' | 'readability' | 'photos' | 'provenance'>('features');
  const [showLegalRef, setShowLegalRef] = useState<boolean>(false);
  const [isAuditingQr, setIsAuditingQr] = useState<boolean>(false);
  const [qrAuditLiveResult, setQrAuditLiveResult] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);

  const isCompliant = report.overallVerdict === 'COMPLIANT';
  const isSerious = report.overallVerdict === 'SERIOUS_VIOLATION';

  const printReport = () => {
    if (componentRef.current) {
      exportToPdf(
        componentRef.current,
        `LMPC_Report_${report.productName?.replace(/\s+/g, '_') || 'Product'}.pdf`,
        setIsExporting
      );
    }
  };

  // Build the 10 core mandatory packaging feature cards
  const mandatoryFeatureCards = [
    {
      id: 'commodity',
      title: 'Product Name & Designation',
      icon: Package,
      status: report.declarations.commodityName.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.commodityName.value || report.productName || 'Not Detected',
      legalClause: 'Rule 6(1)(b)',
      observation: report.declarations.commodityName.isCompliant
        ? 'Generic/common commodity name is prominently printed on the Principal Display Panel.'
        : 'Generic commodity name is absent, ambiguous, or not clearly designated.',
      remediation: 'Ensure the standard generic or common name of the commodity is clearly displayed.',
    },
    {
      id: 'netQty',
      title: 'Net Quantity & Metric Units',
      icon: Scale,
      status: report.declarations.netQuantity.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.netQuantity.numericValue
        ? `${report.declarations.netQuantity.numericValue} ${report.declarations.netQuantity.declaredUnit || ''}`
        : report.declarations.netQuantity.value || 'Not Detected',
      legalClause: 'Rule 6(1)(c) & Rule 11',
      observation: report.declarations.netQuantity.isCompliant
        ? `Declared net quantity is stated using standard metric units (${report.declarations.netQuantity.declaredUnit || 'metric'}) without non-standard abbreviations.`
        : report.declarations.netQuantity.hasProhibitedQualifiers
        ? 'Illegal misleading qualifier detected (e.g. "approx", "when packed", "minimum") preceding net quantity.'
        : !report.declarations.netQuantity.isStandardUnit
        ? `Non-standard metric unit used (e.g., "${report.declarations.netQuantity.declaredUnit}"). Must strictly use g, kg, ml, l, or N.`
        : 'Net quantity declaration missing or obscured.',
      remediation: 'Declare exact net weight or volume using statutory symbols (g, kg, ml, l) with no prefixes.',
    },
    {
      id: 'mrp',
      title: 'Maximum Retail Price (MRP)',
      icon: DollarSign,
      status: report.declarations.mrp.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.mrp.mrpAmount
        ? `₹ ${report.declarations.mrp.mrpAmount}`
        : report.declarations.mrp.value || 'Not Detected',
      legalClause: 'Rule 6(1)(e)',
      observation: report.declarations.mrp.isCompliant
        ? 'MRP is clearly printed and includes the mandatory "inclusive of all taxes" statement.'
        : !report.declarations.mrp.inclusiveOfAllTaxes
        ? 'MRP is printed but lacks the mandatory wording "inclusive of all taxes" (or uses prohibited "taxes extra").'
        : 'MRP declaration is missing or altered.',
      remediation: 'Print MRP prominently in Indian Rupees with the exact phrase "incl. of all taxes".',
    },
    {
      id: 'usp',
      title: 'Unit Sale Price (USP)',
      icon: DollarSign,
      status: report.declarations.unitSalePrice.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.unitSalePrice.value || (report.declarations.unitSalePrice.unitPriceAmount ? `₹ ${report.declarations.unitSalePrice.unitPriceAmount} ${report.declarations.unitSalePrice.unitBasis || ''}` : 'Missing on Label'),
      legalClause: 'Rule 6(10) (2022 Amendment)',
      observation: report.declarations.unitSalePrice.isCompliant
        ? `Unit Sale Price is correctly declared (${report.declarations.unitSalePrice.value || 'compliant'}) per statutory unit basis.`
        : report.declarations.unitSalePrice.value
        ? `Calculated USP does not match declared MRP/Quantity. Expected: ${report.declarations.unitSalePrice.expectedUnitPrice || 'consistent calculation'}.`
        : 'Mandatory Unit Sale Price (price per g, kg, ml, or piece) is missing from packaging.',
      remediation: 'Declare Unit Sale Price rounded to two decimal places directly alongside or below the MRP.',
    },
    {
      id: 'dates',
      title: 'Manufacturing & Expiry Dates',
      icon: Calendar,
      status: report.declarations.dateOfManufactureOrPacking.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.dateOfManufactureOrPacking.value || 'Not Detected',
      legalClause: 'Rule 6(1)(d)',
      observation: report.declarations.dateOfManufactureOrPacking.isCompliant
        ? 'Month and year of manufacture/packing are legibly indicated.'
        : 'Packaging date is absent or missing required month/year specifications.',
      remediation: 'Clearly print month and year of manufacture/packaging (e.g., "Mfg Date: 08/2026").',
    },
    {
      id: 'manufacturer',
      title: 'Manufacturer & Packer Address',
      icon: MapPin,
      status: report.declarations.manufacturerDetails.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.manufacturerDetails.value || 'Not Detected',
      legalClause: 'Rule 6(1)(a)',
      observation: report.declarations.manufacturerDetails.isCompliant
        ? 'Complete name and physical factory/packer address with 6-digit postal PIN code declared.'
        : !report.declarations.manufacturerDetails.pinCodeDeclared
        ? 'Manufacturer address is printed but missing mandatory 6-digit postal PIN code.'
        : 'Complete physical address of the manufacturer/packer is missing.',
      remediation: 'Provide full corporate entity name, complete physical address, and valid 6-digit postal PIN code.',
    },
    {
      id: 'consumerCare',
      title: 'Consumer Care & Grievance Helpline',
      icon: Phone,
      status: report.declarations.consumerCare.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.consumerCare.telephoneNumber || report.declarations.consumerCare.emailId
        ? `${report.declarations.consumerCare.telephoneNumber || ''} ${report.declarations.consumerCare.emailId ? '• ' + report.declarations.consumerCare.emailId : ''}`
        : 'Incomplete / Missing',
      legalClause: 'Rule 6(1)(f)',
      observation: report.declarations.consumerCare.isCompliant
        ? 'All 4 mandatory consumer care components (Designation, Address, Phone, Email) are present.'
        : `Consumer care is missing mandatory items: ${report.declarations.consumerCare.missingFieldsList?.join(', ') || 'Helpline or email'}.`,
      remediation: 'Display complete grievance contact: Officer designation, physical address, phone/toll-free number, and email ID.',
    },
    {
      id: 'origin',
      title: 'Country of Origin',
      icon: Building,
      status: report.declarations.countryOfOrigin.isCompliant ? 'PASS' : 'FAIL',
      value: report.declarations.countryOfOrigin.country || report.declarations.countryOfOrigin.value || 'Not Declared',
      legalClause: 'Rule 6(1)(n)',
      observation: report.declarations.countryOfOrigin.isCompliant
        ? `Country of origin is clearly declared as ${report.declarations.countryOfOrigin.country || 'India'}.`
        : 'Country of origin is not explicitly specified on the packaging label.',
      remediation: 'Print "Country of Origin: [Country]" clearly on the Principal Display Panel or declaration panel.',
    },
    {
      id: 'readability',
      title: 'Text Readability & Print Size',
      icon: Eye,
      status: report.readability.isFontHeightCompliant ? 'PASS' : 'FAIL',
      value: `Contrast: ${report.readability.contrastRatio}:1 (${report.readability.contrastScore})`,
      legalClause: 'Schedule II Readability',
      observation: report.readability.isFontHeightCompliant
        ? `Font height meets minimum legibility requirements for the declared net weight. Contrast ratio is ${report.readability.contrastRatio}:1.`
        : `Font size is too small for the declared net weight (${report.readability.measuredFontHeightMm}mm measured vs ${report.readability.requiredMinFontHeightMm}mm required).`,
      remediation: 'Ensure text and numerals meet minimum height thresholds and maintain sharp contrast against background.',
    },
    {
      id: 'batchCode',
      title: 'Batch / Lot & Statutory Codes',
      icon: Barcode,
      status: report.declarations.batchOrLotNumber?.isCompliant !== false ? 'PASS' : 'WARNING',
      value: report.declarations.batchOrLotNumber?.value || report.declarations.fssaiNumber?.value || 'Detected',
      legalClause: 'Rule 6(1)(g)',
      observation: 'Batch or lot identification code is present for traceability.',
      remediation: 'Maintain clear batch/lot coding on all packaged units.',
    },
  ];

  const passedCount = mandatoryFeatureCards.filter((f) => f.status === 'PASS').length;
  const totalCount = mandatoryFeatureCards.length;

  return (
    <div ref={componentRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 print:p-0 print:m-0 bg-slate-50 min-h-screen">
      {/* Action Bar */}
      <div id="report-action-bar" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <button
          onClick={onBackToScanner}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scanner</span>
        </button>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar touch-pan-x">
          {!isCompliant && onOpenRemediation && (
            <button
              onClick={onOpenRemediation}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3.5 py-2 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <span>Artwork Fix Specs</span>
            </button>
          )}

          <button
            onClick={onOpenNoticeGenerator}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 px-3.5 py-2 rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
            title="Generate Statutory Notice or Official Inspection Memo"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Notice</span>
          </button>

          {onOpenWeightToleranceTest && (
            <button
              onClick={onOpenWeightToleranceTest}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <Scale className="w-3.5 h-3.5 text-slate-600" />
              <span>Weight Scale Test</span>
            </button>
          )}

          <button
            onClick={printReport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3.5 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0 disabled:opacity-60"
            title="Download PDF Report"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>{isExporting ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* Main Inspection Result */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCompliant ? 'bg-emerald-600' : 'bg-rose-600'}`} aria-hidden="true" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-[.18em] text-[#b38a3e]">04 / RESULT</span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                {report.id}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(report.timestamp).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {report.productName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Brand: <strong className="text-slate-800">{report.brandName}</strong> • Category:{' '}
              <strong className="text-slate-800">{report.category.replace(/_/g, ' ')}</strong> • Package Type:{' '}
              <strong className="text-slate-800">{report.packageType.replace(/_/g, ' ')}</strong>
            </p>
          </div>

          {/* Quick Inspection Metric Counters */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shrink-0">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Overall Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide mt-1 ${
                  isCompliant
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : isSerious
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {isCompliant ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                )}
                {isCompliant ? 'COMPLIANT' : isSerious ? 'SERIOUS VIOLATION' : 'REVIEW REQUIRED'}
              </span>
            </div>

            <div className="h-10 w-[1px] bg-slate-200 hidden sm:block"></div>

            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Compliance Score
              </span>
              <span
                className={`text-2xl font-black ${
                  report.complianceScore >= 85
                    ? 'text-emerald-600'
                    : report.complianceScore >= 60
                    ? 'text-amber-600'
                    : 'text-rose-600'
                }`}
              >
                {report.complianceScore}%
              </span>
            </div>

            <div className="h-10 w-[1px] bg-slate-200 hidden sm:block"></div>

            <div className="text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Features Passed
              </span>
              <span className="text-2xl font-black text-slate-900">
                {passedCount} / {totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Premise & Inspector Footer */}
        <div className="pt-4 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            <span>Premise: </span>
            <strong className="text-slate-800">{report.inspectorInfo.inspectionLocation || 'Market Checkpoint'}</strong>
          </div>
          <div>
            <span>Inspector In-Charge: </span>
            <strong className="text-slate-800">{report.inspectorInfo.name}</strong>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center justify-between overflow-x-auto no-scrollbar touch-pan-x">
        <nav className="flex space-x-6 min-w-max pb-0.5">
          <button
            onClick={() => setActiveTab('features')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'features'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Mandatory Packaging Checks</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {passedCount}/{totalCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'data'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Extracted Label Data</span>
          </button>

          <button
            onClick={() => setActiveTab('readability')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'readability'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Text Readability &amp; Print</span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'photos'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Packaging Photos</span>
          </button>

          <button
            id="tab-btn-provenance"
            onClick={() => setActiveTab('provenance')}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'provenance'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Barcode &amp; QR Provenance</span>
            {report.declarations.barcodeVerification?.provenanceMatchStatus === 'SUSPECTED_MISMATCH' && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800">
                MISMATCH
              </span>
            )}
          </button>
        </nav>

        {/* Legal Reference Toggle */}
        <button
          onClick={() => setShowLegalRef(!showLegalRef)}
          className="text-xs text-slate-400 hover:text-slate-600 font-medium pb-2 cursor-pointer hidden md:flex items-center gap-1"
        >
          <span>{showLegalRef ? 'Hide Legal Clauses' : 'Show Legal Clauses'}</span>
        </button>
      </div>

      {/* Tab 1: Mandatory Packaging Features Checklist (Default & Core View) */}
      {activeTab === 'features' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Inspection results across all statutory packaging requirements</span>
            <span className="font-semibold text-slate-700">
              Pass Rate: {Math.round((passedCount / totalCount) * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mandatoryFeatureCards.map((feature) => {
              const Icon = feature.icon;
              const isPass = feature.status === 'PASS';

              return (
                <div
                  key={feature.id}
                  className={`rounded-2xl border p-5 transition-all shadow-2xs ${
                    isPass
                      ? 'bg-white border-slate-200'
                      : 'bg-rose-50/20 border-rose-200 ring-1 ring-rose-500/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isPass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{feature.title}</h3>
                        {showLegalRef && (
                          <span className="text-[10px] font-mono text-slate-400 block">
                            {feature.legalClause}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shrink-0 ${
                        isPass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {feature.status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    {/* Value on Package */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                        Printed on Package
                      </span>
                      <p className="font-semibold text-slate-800 truncate">{feature.value}</p>
                    </div>

                    {/* Observation / Inspection finding */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Inspection Finding
                      </span>
                      <p className="text-slate-700 mt-0.5 leading-relaxed">{feature.observation}</p>
                    </div>

                    {/* Action if failed */}
                    {!isPass && (
                      <div className="pt-2 border-t border-rose-100 text-rose-700 text-[11px] font-medium flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                        <span>{feature.remediation}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Extracted Label Data */}
      {activeTab === 'data' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Extracted Packaging Declarations</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Verbatim information extracted across all packaging angles and statutory panels
              </p>
            </div>
            {report.brandName && (
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full w-fit">
                Brand: <span className="text-emerald-700">{report.brandName}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Common / Generic Commodity</span>
              <p className="text-sm font-bold text-slate-900">{report.declarations.commodityName.value || report.productName || 'Not Detected'}</p>
              {report.declarations.commodityName.rawText && (
                <p className="text-[11px] text-slate-500 italic">"{report.declarations.commodityName.rawText}"</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Net Weight / Volume</span>
              <p className="text-sm font-bold text-slate-900">
                {report.declarations.netQuantity.numericValue
                  ? `${report.declarations.netQuantity.numericValue} ${report.declarations.netQuantity.declaredUnit || ''}`
                  : report.declarations.netQuantity.value || 'Not Detected'}
              </p>
              <p className="text-[11px] text-slate-500">
                Metric Standard: {report.declarations.netQuantity.isStandardUnit ? 'Yes (Rule 11)' : 'Non-Compliant'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Maximum Retail Price (MRP)</span>
              <p className="text-sm font-bold text-slate-900">
                {report.declarations.mrp.value
                  ? (report.declarations.mrp.value.trim().startsWith('₹') || report.declarations.mrp.value.trim().startsWith('Rs')
                      ? report.declarations.mrp.value
                      : `₹ ${report.declarations.mrp.value}`)
                  : (report.declarations.mrp.mrpAmount ? `₹ ${report.declarations.mrp.mrpAmount.toFixed(2)}` : 'Not Detected')}
              </p>
              <p className="text-[11px] text-slate-500">
                {report.declarations.mrp.inclusiveOfAllTaxes ? 'Incl. all taxes declared' : 'Missing tax phrase'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Unit Sale Price (USP)</span>
              <p className="text-sm font-bold text-slate-900">
                {report.declarations.unitSalePrice.value ||
                  (report.declarations.unitSalePrice.unitPriceAmount
                    ? `₹ ${report.declarations.unitSalePrice.unitPriceAmount} ${report.declarations.unitSalePrice.unitBasis || ''}`
                    : 'Not Declared on Label')}
              </p>
              <p className="text-[11px] text-slate-500">
                Mandatory under Rule 6(10)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Date of Packing / Mfg</span>
              <p className="text-sm font-bold text-slate-900">{report.declarations.dateOfManufactureOrPacking.value || 'Not Detected'}</p>
              <p className="text-[11px] text-slate-500">Rule 6(1)(d)</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Country of Origin</span>
              <p className="text-sm font-bold text-slate-900">{report.declarations.countryOfOrigin.country || report.declarations.countryOfOrigin.value || 'India'}</p>
              <p className="text-[11px] text-slate-500">Rule 6(1)(n)</p>
            </div>

            {report.declarations.batchOrLotNumber?.value && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Batch / Lot Number</span>
                <p className="text-sm font-bold text-slate-900">{report.declarations.batchOrLotNumber.value}</p>
                <p className="text-[11px] text-slate-500">Rule 6(1)(g)</p>
              </div>
            )}

            {report.declarations.fssaiNumber?.value && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">FSSAI License Number</span>
                <p className="text-sm font-bold font-mono text-slate-900">{report.declarations.fssaiNumber.value}</p>
                <p className="text-[11px] text-slate-500">Food Safety Standard</p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium">Postal PIN Code</span>
              <p className="text-sm font-bold text-slate-900">
                {report.declarations.manufacturerDetails.pinCodeDeclared ? 'Declared (Compliant)' : 'Missing PIN Code'}
              </p>
              <p className="text-[11px] text-slate-500">Required under Rule 6(1)(a)</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 md:col-span-2 lg:col-span-3">
              <span className="text-slate-500 font-medium">Manufacturer / Packer Physical Address</span>
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {report.declarations.manufacturerDetails.value || 'Not Detected'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 md:col-span-2 lg:col-span-3">
              <span className="text-slate-500 font-medium">Consumer Grievance Helpline, Email &amp; Office</span>
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {report.declarations.consumerCare.value ||
                  [
                    report.declarations.consumerCare.telephoneNumber ? `Phone: ${report.declarations.consumerCare.telephoneNumber}` : null,
                    report.declarations.consumerCare.emailId ? `Email: ${report.declarations.consumerCare.emailId}` : null,
                    report.declarations.consumerCare.fullAddress ? `Address: ${report.declarations.consumerCare.fullAddress}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ') || 'Not Detected'}
              </p>
            </div>
          </div>

          {/* Complete Verbatim OCR Text Transcription Section */}
          {report.notes && (
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Verbatim Inspection Notes &amp; Raw OCR Text
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Evidence Audit Trail</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto border border-slate-800 shadow-inner select-text">
                {report.notes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Text Readability & Print */}
      {activeTab === 'readability' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">Print Quality &amp; Font Readability</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
              <span className="text-xs text-slate-500 font-medium">Text Contrast Ratio</span>
              <div className="text-3xl font-black text-slate-900">{report.readability.contrastRatio}:1</div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                {report.readability.contrastScore}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
              <span className="text-xs text-slate-500 font-medium">Font Height Threshold</span>
              <div className="text-3xl font-black text-slate-900">{report.readability.measuredFontHeightMm} mm</div>
              <span className="text-xs text-slate-500 block">
                Required Min: {report.readability.requiredMinFontHeightMm} mm
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
              <span className="text-xs text-slate-500 font-medium">Visual Clarity Score</span>
              <div className="text-3xl font-black text-slate-900">{report.readability.clarityAndSharpness}%</div>
              <span className="text-xs text-slate-500 block">
                {report.readability.obscuredByGraphics ? 'Partially Obscured' : 'Clear & Unobstructed'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <span className="font-bold text-slate-900">Readability Assessment:</span>
            <p className="leading-relaxed">{report.readability.plainLanguageVerdict}</p>
          </div>
        </div>
      )}

      {/* Tab 4: Packaging Photos */}
      {activeTab === 'photos' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">Captured Packaging Photos</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Front Label (PDP)</span>
              <div className="aspect-4/5 rounded-xl overflow-hidden bg-white flex items-center justify-center">
                {report.images.pdpImage ? (
                  <img
                    src={report.images.pdpImage}
                    alt="Front Label"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No front photo</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Back Panel</span>
              <div className="aspect-4/5 rounded-xl overflow-hidden bg-white flex items-center justify-center">
                {report.images.backPanelImage ? (
                  <img
                    src={report.images.backPanelImage}
                    alt="Back Label"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No back photo</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Side / Flap Panel</span>
              <div className="aspect-4/5 rounded-xl overflow-hidden bg-white flex items-center justify-center">
                {report.images.sidePanelImage ? (
                  <img
                    src={report.images.sidePanelImage}
                    alt="Side Panel"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No side photo</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Close-Up Detail</span>
              <div className="aspect-4/5 rounded-xl overflow-hidden bg-white flex items-center justify-center">
                {report.images.mrpStampImage ? (
                  <img
                    src={report.images.mrpStampImage}
                    alt="Macro Stamp"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400">No close-up photo</span>
                )}
              </div>
            </div>
          </div>

          {/* Extra Supporting Panels if provided */}
          {report.images.supportingImages && report.images.supportingImages.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Additional Investigated Angles ({report.images.supportingImages.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {report.images.supportingImages.map((imgUrl, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-2 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500">Angle {i + 1}</span>
                    <div className="aspect-square rounded-lg overflow-hidden bg-white flex items-center justify-center">
                      <img src={imgUrl} alt={`Supporting angle ${i + 1}`} className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Barcode & Smart QR Provenance Verification */}
      {activeTab === 'provenance' && (() => {
        const barcodeVer =
          report.declarations.barcodeVerification ||
          verifyBarcodeProvenance(
            report.declarations.barcode?.value || '',
            report.declarations.countryOfOrigin?.country || report.declarations.countryOfOrigin?.value || '',
            report.declarations.manufacturerDetails?.value || ''
          );

        const qrCodeValue = report.declarations.qrCode?.value || '';

        const handleLiveQrAudit = async () => {
          if (!qrCodeValue) return;
          setIsAuditingQr(true);
          try {
            const res = await verifyLiveQrEndpoint(qrCodeValue);
            setQrAuditLiveResult(res);
          } catch (err: any) {
            setQrAuditLiveResult({
              tested: true,
              ok: false,
              isAccessible: false,
              error: err?.message || 'Failed to crawl QR destination URL',
            });
          } finally {
            setIsAuditingQr(false);
          }
        };

        return (
          <div className="space-y-6">
            {/* 1. Barcode & GS1 Origin Cross-Verifier */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      Rule 6(1)(n) &amp; Section 36
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      GS1 General Specifications
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                    <Barcode className="w-5 h-5 text-blue-600" />
                    Packaging Barcode (EAN-13 / GTIN) &amp; Origin Cross-Verifier
                  </h3>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                    barcodeVer.provenanceMatchStatus === 'VERIFIED_MATCH'
                      ? 'bg-emerald-100 text-emerald-800'
                      : barcodeVer.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {barcodeVer.provenanceMatchStatus === 'VERIFIED_MATCH' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : barcodeVer.provenanceMatchStatus === 'SUSPECTED_MISMATCH' ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {barcodeVer.provenanceMatchStatus === 'VERIFIED_MATCH'
                    ? 'ORIGIN MATCH CONFIRMED'
                    : barcodeVer.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                    ? 'PROVENANCE MISMATCH DETECTED'
                    : 'VERIFIED'}
                </span>
              </div>

              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border text-xs leading-relaxed ${
                  barcodeVer.provenanceMatchStatus === 'VERIFIED_MATCH'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : barcodeVer.provenanceMatchStatus === 'SUSPECTED_MISMATCH'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="font-bold mb-1">Inspector Observation:</div>
                <p>{barcodeVer.observation}</p>
              </div>

              {/* Data Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 block mb-1">Detected Barcode</span>
                  <strong className="font-mono text-slate-900 text-sm block">
                    {barcodeVer.rawCode || barcodeVer.barcodeNumber || 'None detected'}
                  </strong>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 block mb-1">GS1 Country Prefix</span>
                  <strong className="font-mono text-blue-600 text-sm block">
                    {barcodeVer.prefix || 'N/A'}
                  </strong>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 block mb-1">Issuing Member Org</span>
                  <strong className="text-slate-900 text-sm block">
                    {barcodeVer.countryOfIssuance || 'Unknown'}
                  </strong>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 block mb-1">Modulo-10 Checksum</span>
                  <strong
                    className={`text-sm block ${
                      barcodeVer.isCheckDigitValid ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'
                    }`}
                  >
                    {barcodeVer.isCheckDigitValid ? 'Valid (Match)' : 'Checksum Failure'}
                  </strong>
                </div>
              </div>

              {/* Modulo-10 Check Calculation Details */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
                <span className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
                  GS1 Modulo-10 Math Audit
                </span>
                <div className="flex flex-wrap items-center justify-between gap-3 font-mono bg-slate-50 p-2.5 rounded-lg">
                  <div>
                    <span className="text-slate-500">Calculated Last Digit: </span>
                    <strong className="text-slate-900">{barcodeVer.calculatedCheckDigit}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Printed Last Digit: </span>
                    <strong className={barcodeVer.isCheckDigitValid ? 'text-emerald-700' : 'text-rose-700'}>
                      {barcodeVer.actualCheckDigit}
                    </strong>
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Statutory Rule: {barcodeVer.legalCitation}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Smart QR & 2022 Digital Declaration Verifier */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      Notification G.S.R. 540(E)
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      July 14, 2022 Electronic Exemption
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    Smart QR Code &amp; Digital Declaration Exemption Auditor
                  </h3>
                </div>

                {qrCodeValue && (
                  <button
                    id="btn-audit-report-qr"
                    onClick={handleLiveQrAudit}
                    disabled={isAuditingQr}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isAuditingQr ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    {isAuditingQr ? 'Auditing URL...' : 'Audit Digital Shelf Live'}
                  </button>
                )}
              </div>

              {/* QR Payload Details */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                <span className="font-bold text-slate-700 block">QR Code Content / Landing Target:</span>
                <p className="font-mono text-slate-900 break-all bg-white p-2.5 rounded-lg border border-slate-200">
                  {qrCodeValue || 'No QR code was detected in the photographed label angles.'}
                </p>
              </div>

              {/* Physical Packaging Safeguard Card */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Physical Label Safeguard Check (Anti-Circumvention)
                </div>
                <p>
                  Under Notification G.S.R. 540(E), MRP, Net Quantity, Commodity Generic Name, and Consumer Care Contact details CANNOT be relegated solely to a QR code. They are verified on the physical carton.
                </p>
              </div>

              {/* Live Crawler Results if triggered */}
              {qrAuditLiveResult && (
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-950">Live URL Verification Results:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full ${
                        qrAuditLiveResult.isAccessible
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      HTTP {qrAuditLiveResult.httpStatus || 'Error'} • {qrAuditLiveResult.isAccessible ? 'Accessible' : 'Unreachable'}
                    </span>
                  </div>

                  {qrAuditLiveResult.detectedDeclarations && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      <div className="flex items-center justify-between p-2 bg-white rounded border border-indigo-100">
                        <span>Manufacturer Address:</span>
                        <strong>{qrAuditLiveResult.detectedDeclarations.manufacturerNameAndAddress ? '✅ Found' : '❌ Missing'}</strong>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white rounded border border-indigo-100">
                        <span>Generic Commodity Name:</span>
                        <strong>{qrAuditLiveResult.detectedDeclarations.commonGenericName ? '✅ Found' : '❌ Missing'}</strong>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white rounded border border-indigo-100">
                        <span>Technical Dimensions / Size:</span>
                        <strong>{qrAuditLiveResult.detectedDeclarations.sizeAndDimensions ? '✅ Found' : '❌ Missing'}</strong>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-white rounded border border-indigo-100">
                        <span>Consumer Care Contact:</span>
                        <strong>{qrAuditLiveResult.detectedDeclarations.consumerCareDetails ? '✅ Found' : '❌ Missing'}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
