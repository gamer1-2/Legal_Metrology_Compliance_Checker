import React, { useState } from 'react';
import {
  FolderArchive,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Trash2,
  Download,
  Eye,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import { InspectionResult } from '../types/compliance';
import { createExcelFormattedCsv, downloadCsv } from '../utils/fileExport';

interface RepositoryViewProps {
  inspections: InspectionResult[];
  onSelectInspection: (inspection: InspectionResult) => void;
  onDeleteInspection: (id: string) => void;
  onOpenStudio?: (inspection: InspectionResult) => void;
  onUpdateCaseStatus?: (id: string, status: string) => void;
  onClearAllInspections?: () => void;
  onNavigateToScanner?: () => void;
}

export const RepositoryView: React.FC<RepositoryViewProps> = ({
  inspections,
  onSelectInspection,
  onDeleteInspection,
  onOpenStudio,
  onUpdateCaseStatus,
  onClearAllInspections,
  onNavigateToScanner,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'COMPLIANT' | 'NON_COMPLIANT' | 'SERIOUS_VIOLATION'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const filtered = inspections.filter((item) => {
    const matchesSearch =
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesVerdict = verdictFilter === 'ALL' || item.overallVerdict === verdictFilter;
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;

    return matchesSearch && matchesVerdict && matchesCategory;
  });

  const compliantCount = inspections.filter((x) => x.overallVerdict === 'COMPLIANT').length;
  const nonCompliantCount = inspections.filter((x) => x.overallVerdict === 'NON_COMPLIANT').length;
  const seriousViolationCount = inspections.filter((x) => x.overallVerdict === 'SERIOUS_VIOLATION').length;

  const [isExporting, setIsExporting] = useState(false);

  const exportAllCSV = async () => {
    if (inspections.length === 0) {
      alert('No inspection records available in storage to export.');
      return;
    }

    setIsExporting(true);
    try {
      const headers = [
        'Case Reference ID',
        'Inspection Date & Time',
        'Product Name',
        'Brand Name',
        'Category',
        'Package Type',
        'Statutory Verdict',
        'Compliance Score (%)',
        'Declared MRP (INR)',
        'Declared Net Quantity',
        'Unit Sale Price (USP)',
        'Manufacturer / Packer Details',
        'Month & Year of Pkg / Mfg',
        'Country of Origin',
        'Consumer Care Contact',
        'Batch / Lot / FSSAI',
        'Critical Violations',
        'Major Violations',
        'Inspector Name',
        'Inspector Badge',
        'Inspection Location',
        'Case Status',
        'Inspector Notes',
      ];

      // Export all inspections in storage
      const rows = inspections.map((x) => [
        x.id,
        new Date(x.timestamp).toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        x.productName,
        x.brandName,
        x.category,
        x.packageType,
        x.overallVerdict,
        `${x.complianceScore}%`,
        x.declarations?.mrp?.value || 'N/A',
        x.declarations?.netQuantity?.value || 'N/A',
        x.declarations?.unitSalePrice?.value || 'N/A',
        x.declarations?.manufacturerDetails?.value || 'N/A',
        x.declarations?.dateOfManufactureOrPacking?.value || 'N/A',
        x.declarations?.countryOfOrigin?.country || x.declarations?.countryOfOrigin?.value || 'N/A',
        x.declarations?.consumerCare?.isCompliant
          ? `${x.declarations.consumerCare.telephoneNumber || ''} ${x.declarations.consumerCare.emailId || ''}`.trim()
          : x.declarations?.consumerCare?.rawText || 'Missing / Incomplete',
        x.declarations?.batchOrLotNumber?.value || x.declarations?.fssaiNumber?.value || 'N/A',
        x.violationsCount?.critical ?? 0,
        x.violationsCount?.major ?? 0,
        x.inspectorInfo?.name || 'N/A',
        x.inspectorInfo?.badgeId || 'N/A',
        x.inspectorInfo?.inspectionLocation || 'N/A',
        x.caseStatus || 'SURVEILLANCE',
        x.notes || 'Routine surveillance inspection under Legal Metrology Act, 2009',
      ]);

      const csvContent = createExcelFormattedCsv(headers, rows);
      const filename = `LMPC_Inspection_Register_${new Date().toISOString().slice(0, 10)}.csv`;

      downloadCsv(filename, csvContent);
    } catch (err) {
      console.error('Failed to export CSV register:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Records header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="text-[10px] font-mono tracking-[.18em] text-[#b38a3e] mb-2">05 / RECORDS</div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderArchive className="w-5 h-5 text-orange-600" />
            Inspection register
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Search, retrieve, and export completed product inspections and evidence trails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {inspections.length > 0 && onClearAllInspections && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all inspection records? This action cannot be undone.')) {
                  onClearAllInspections();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              Clear History
            </button>
          )}
          <button
            onClick={exportAllCSV}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
            title="Download CSV for all stored inspections"
          >
            <Download className={`w-4 h-4 text-slate-500 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Downloading...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Metric Pills Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block">Total Inspections</span>
          <div className="text-xl font-bold text-slate-900 mt-0.5">{inspections.length}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-700 block">Compliant Products</span>
          <div className="text-xl font-bold text-emerald-700 mt-0.5">{compliantCount}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-700 block">Non-Compliant</span>
          <div className="text-xl font-bold text-amber-700 mt-0.5">{nonCompliantCount}</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-700 block">Critical Violations</span>
          <div className="text-xl font-bold text-rose-700 mt-0.5">{seriousViolationCount}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by commodity, brand, or case ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setVerdictFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              verdictFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Verdicts
          </button>
          <button
            onClick={() => setVerdictFilter('COMPLIANT')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              verdictFilter === 'COMPLIANT'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Compliant
          </button>
          <button
            onClick={() => setVerdictFilter('NON_COMPLIANT')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              verdictFilter === 'NON_COMPLIANT'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Non-Compliant
          </button>
          <button
            onClick={() => setVerdictFilter('SERIOUS_VIOLATION')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              verdictFilter === 'SERIOUS_VIOLATION'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            Serious Violations
          </button>
        </div>
      </div>

      {/* Cases List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          inspections.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-4 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FolderArchive className="w-7 h-7 text-slate-400" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-800">No User Investigation Records Yet</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Only real products inspected by you are recorded here. Capture or upload packaging photos in the Product Scanner to perform an investigation and log official findings.
                </p>
              </div>
              {onNavigateToScanner && (
                <div className="pt-2">
                  <button
                    onClick={onNavigateToScanner}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer inline-flex items-center gap-2 shadow-2xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Go to Product Scanner</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
              <FolderArchive className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No matching case records found</p>
              <p className="text-xs text-slate-400">Try adjusting search criteria or clearing filters.</p>
            </div>
          )
        ) : (
          filtered.map((item) => {
            const isPass = item.overallVerdict === 'COMPLIANT';
            const isSerious = item.overallVerdict === 'SERIOUS_VIOLATION';

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  {/* Thumbnail / Status Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                      isPass
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : isSerious
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200'
                    }`}
                  >
                    {isPass ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : isSerious ? (
                      <XCircle className="w-6 h-6" />
                    ) : (
                      <AlertTriangle className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-slate-500">{item.id}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          isPass
                            ? 'bg-emerald-100 text-emerald-800'
                            : isSerious
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.overallVerdict.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 mt-0.5">{item.productName}</h4>
                    <p className="text-xs text-slate-500">
                      Brand: <strong className="text-slate-700">{item.brandName}</strong> • Category:{' '}
                      <span className="text-slate-700">{item.category.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  {onOpenStudio && (
                    <button
                      onClick={() => onOpenStudio(item)}
                      className="flex-1 md:flex-initial px-3.5 py-2 md:py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1 transition-colors min-h-[38px] cursor-pointer"
                      title="Inspect in Studio"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Studio</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSelectInspection(item)}
                    className="flex-1 md:flex-initial px-3.5 py-2 md:py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1 transition-colors shadow-2xs min-h-[38px] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Memo</span>
                  </button>

                  <button
                    onClick={() => onDeleteInspection(item.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
