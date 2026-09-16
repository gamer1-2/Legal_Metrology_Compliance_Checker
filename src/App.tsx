/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, AppPage } from './components/Sidebar';
import { ScannerView } from './components/ScannerView';
import { ForensicStudioView } from './components/ForensicStudioView';
import { ComplianceReportView } from './components/ComplianceReportView';
import { ToolsView } from './components/ToolsView';
import { FontHeightToolView } from './components/tools/FontHeightToolView';
import { UspCalculatorToolView } from './components/tools/UspCalculatorToolView';
import { WeightToleranceToolView } from './components/tools/WeightToleranceToolView';
import { PenaltyEstimatorToolView } from './components/tools/PenaltyEstimatorToolView';
import { ServerSyncToolView } from './components/tools/ServerSyncToolView';
import { BarcodeProvenanceView } from './components/BarcodeProvenanceView';
import { SmartQrAuditorView } from './components/SmartQrAuditorView';
import { RepositoryView } from './components/RepositoryView';
import { DashboardView } from './components/DashboardView';
import { RulebookView } from './components/RulebookView';
import { NoticeGeneratorModal } from './components/NoticeGeneratorModal';
import { ArtworkRemediationModal } from './components/ArtworkRemediationModal';
import { WeightToleranceModal } from './components/WeightToleranceModal';
import { BackendConnectionModal } from './components/BackendConnectionModal';
import { InspectionResult, UserRole } from './types/compliance';
import {
  getSavedInspections,
  saveInspectionToRepository,
  deleteInspectionFromRepository,
  clearAllInspections,
  isDummyInspection,
  isNativeApkRuntime,
  getStoredBackendUrl,
  subscribeToInspectionUpdates,
} from './services/complianceEngine';
import {
  Scale,
  Menu,
  ChevronRight,
  Layers,
  ShieldCheck,
  Camera,
  FileText,
  Sparkles,
  FolderArchive,
  Calculator,
  BarChart3,
  BookOpen,
  Server,
} from 'lucide-react';

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>('scan');
  const [userRole, setUserRole] = useState<UserRole>('INSPECTOR');
  const [currentReport, setCurrentReport] = useState<InspectionResult | null>(null);
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals state
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isRemediationModalOpen, setIsRemediationModalOpen] = useState(false);
  const [isWeightToleranceModalOpen, setIsWeightToleranceModalOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  // Initialize repository with stored items (real user inspections only)
  useEffect(() => {
    const saved = getSavedInspections();
    setInspections(saved);
    if (saved && saved.length > 0) {
      if (!currentReport || isDummyInspection(currentReport)) {
        setCurrentReport(saved[0]);
      }
    } else {
      if (currentReport && isDummyInspection(currentReport)) {
        setCurrentReport(null);
      }
    }

    // Subscribe to dynamic storage updates (e.g., IndexedDB hydration or background saves)
    const unsubscribe = subscribeToInspectionUpdates((updated) => {
      setInspections(updated);
      if (updated.length > 0) {
        setCurrentReport((prev) => (!prev || isDummyInspection(prev) ? updated[0] : prev));
      }
    });

    return unsubscribe;
  }, []);

  const handleClearAllInspections = () => {
    clearAllInspections();
    setInspections([]);
    setCurrentReport(null);
  };

  const handleScanComplete = (result: InspectionResult) => {
    setCurrentReport(result);
    saveInspectionToRepository(result);
    const updated = getSavedInspections();
    setInspections(updated);
    // Navigate straight to Inspection Report to show all mandatory feature checks
    setActivePage('report');
  };

  const handleSelectInspection = (inspection: InspectionResult) => {
    setCurrentReport(inspection);
    setActivePage('report');
  };

  const handleOpenStudioForInspection = (inspection: InspectionResult) => {
    setCurrentReport(inspection);
    setActivePage('studio');
  };

  const handleDeleteInspection = (id: string) => {
    deleteInspectionFromRepository(id);
    const updated = getSavedInspections();
    setInspections(updated);
    if (currentReport?.id === id) {
      setCurrentReport(updated[0] || null);
    }
  };

  const handleStartNewScan = () => {
    setActivePage('scan');
  };

  const unresolvedViolations =
    currentReport && currentReport.overallVerdict !== 'COMPLIANT'
      ? (currentReport.violationsCount?.critical || 0) + (currentReport.violationsCount?.major || 0)
      : 0;

  const pageTitles: Record<AppPage, string> = {
    scan: 'Product Scanner',
    report: 'Inspection Report',
    studio: 'Visual Label Inspector',
    barcode: 'Packaging Barcode & Origin Verifier',
    qr: 'Smart QR & Digital Exemption Auditor',
    cases: 'Inspection History',
    tools: 'Calculators & Checkers',
    'tool-font': 'Font Height Calculator (Schedule II)',
    'tool-usp': 'Unit Sale Price (USP) Calculator',
    'tool-mpe': 'Weight Tolerance (MPE) Lab Scale',
    'tool-penalty': 'Statutory Penalties Estimator',
    'tool-server': 'Server & Mobile Sync Setup',
    dashboard: 'Analytics Dashboard',
    handbook: 'Standards Guide',
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans selection:bg-emerald-200">
      {/* Sidebar Navigation */}
      <div className={`${isMobileMenuOpen ? 'fixed inset-0 z-40 flex' : 'hidden md:flex'} print:hidden`}>
        <Sidebar
          activePage={activePage}
          onSelectPage={(page) => {
            setActivePage(page);
            setIsMobileMenuOpen(false);
          }}
          userRole={userRole}
          onChangeRole={setUserRole}
          hasCurrentReport={!!currentReport}
          unresolvedViolationsCount={unresolvedViolations}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onStartNewScan={handleStartNewScan}
          isMobileMenu={isMobileMenuOpen}
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
        />
        {isMobileMenuOpen && (
          <div
            className="flex-1 bg-black/50 backdrop-blur-xs md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top App Bar with Breadcrumbs & Fast Action Buttons */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-4 select-none print:hidden shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-semibold text-slate-700 hidden sm:inline">Packaging Inspector</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
              <span className="font-bold text-slate-900 font-mono">{pageTitles[activePage]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsServerModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
              title="Configure Backend Server Endpoint"
            >
              <Server className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">
                {getStoredBackendUrl() ? 'Server: Custom' : isNativeApkRuntime() ? 'Server (APK)' : 'Server'}
              </span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-6 no-scrollbar">
          {activePage === 'scan' && (
            <ScannerView
              onScanComplete={handleScanComplete}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              recentInspections={inspections}
              onSelectInspection={handleSelectInspection}
              onViewAllHistory={() => setActivePage('cases')}
              onOpenServerSettings={() => setIsServerModalOpen(true)}
            />
          )}

          {activePage === 'studio' && (
            currentReport ? (
              <ForensicStudioView
                report={currentReport}
                onNavigateToReport={() => setActivePage('report')}
                onOpenNoticeGenerator={() => setIsNoticeModalOpen(true)}
                onOpenRemediation={() => setIsRemediationModalOpen(true)}
              />
            ) : (
              <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <Scale className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900">No Active Forensic Inspection Evidence</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Capture or upload packaging evidence in the Field Scanner to analyze statutory declarations and visual bounding boxes.
                </p>
                <button
                  onClick={() => setActivePage('scan')}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open Field Scanner</span>
                </button>
              </div>
            )
          )}

          {activePage === 'report' && (
            currentReport ? (
              <ComplianceReportView
                report={currentReport}
                userRole={userRole}
                onBackToScanner={() => setActivePage('scan')}
                onOpenNoticeGenerator={() => setIsNoticeModalOpen(true)}
                onOpenStudio={() => setActivePage('studio')}
                onOpenRemediation={() => setIsRemediationModalOpen(true)}
                onOpenWeightToleranceTest={() => setIsWeightToleranceModalOpen(true)}
              />
            ) : (
              <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900">No Active Statutory Inspection Report</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Execute a packaging audit to view the full statutory findings, penalty computations, and legal notice generation.
                </p>
                <button
                  onClick={() => setActivePage('scan')}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open Field Scanner</span>
                </button>
              </div>
            )
          )}

          {activePage === 'tools' && (
            <ToolsView onSelectTool={(tool) => setActivePage(tool)} />
          )}

          {activePage === 'tool-font' && (
            <FontHeightToolView
              onBack={() => setActivePage('tools')}
              onSelectTool={(tool) => setActivePage(tool)}
            />
          )}

          {activePage === 'tool-usp' && (
            <UspCalculatorToolView
              onBack={() => setActivePage('tools')}
              onSelectTool={(tool) => setActivePage(tool)}
            />
          )}

          {activePage === 'tool-mpe' && (
            <WeightToleranceToolView
              onBack={() => setActivePage('tools')}
              onSelectTool={(tool) => setActivePage(tool)}
            />
          )}

          {activePage === 'tool-penalty' && (
            <PenaltyEstimatorToolView
              onBack={() => setActivePage('tools')}
              onSelectTool={(tool) => setActivePage(tool)}
            />
          )}

          {activePage === 'tool-server' && (
            <ServerSyncToolView
              onBack={() => setActivePage('tools')}
              onSelectTool={(tool) => setActivePage(tool)}
            />
          )}

          {activePage === 'barcode' && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0">
              <BarcodeProvenanceView
                onBack={() => setActivePage('tools')}
                onSelectTool={(tool) => setActivePage(tool)}
              />
            </div>
          )}

          {activePage === 'qr' && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0">
              <SmartQrAuditorView
                onBack={() => setActivePage('tools')}
                onSelectTool={(tool) => setActivePage(tool)}
              />
            </div>
          )}

          {activePage === 'cases' && (
            <RepositoryView
              inspections={inspections}
              onSelectInspection={handleSelectInspection}
              onDeleteInspection={handleDeleteInspection}
              onOpenStudio={handleOpenStudioForInspection}
              onClearAllInspections={handleClearAllInspections}
              onNavigateToScanner={() => setActivePage('scan')}
            />
          )}

          {activePage === 'dashboard' && (
            <DashboardView
              inspections={inspections}
              onSelectInspection={handleSelectInspection}
            />
          )}

          {activePage === 'handbook' && <RulebookView />}
        </main>

        {/* Mobile Bottom Navigation Bar (Thumb-friendly field inspector layout) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around select-none shadow-lg print:hidden">
          {/* Visual Studio */}
          <button
            onClick={() => {
              if (currentReport) setActivePage('studio');
              else setActivePage('scan');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl min-w-[54px] min-h-[44px] transition-colors cursor-pointer ${
              activePage === 'studio' ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activePage === 'studio' ? 'bg-emerald-100 text-emerald-700' : ''}`}>
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Studio</span>
          </button>

          {/* Report */}
          <button
            onClick={() => {
              if (currentReport) setActivePage('report');
              else setActivePage('scan');
            }}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl min-w-[54px] min-h-[44px] relative transition-colors cursor-pointer ${
              activePage === 'report' ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activePage === 'report' ? 'bg-emerald-100 text-emerald-700' : ''}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Report</span>
            {currentReport && unresolvedViolations > 0 && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            )}
          </button>

          {/* Scan */}
          <button
            onClick={() => setActivePage('scan')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl min-w-[54px] min-h-[44px] transition-colors cursor-pointer ${
              activePage === 'scan' ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activePage === 'scan' ? 'bg-emerald-100 text-emerald-700' : ''}`}>
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Scan</span>
          </button>

          {/* History */}
          <button
            onClick={() => setActivePage('cases')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl min-w-[54px] min-h-[44px] transition-colors cursor-pointer ${
              activePage === 'cases' ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activePage === 'cases' ? 'bg-emerald-100 text-emerald-700' : ''}`}>
              <FolderArchive className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">History</span>
          </button>

          {/* Tools */}
          <button
            onClick={() => setActivePage('tools')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl min-w-[54px] min-h-[44px] transition-colors cursor-pointer ${
              activePage === 'tools' || activePage.startsWith('tool-')
                ? 'text-emerald-700 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activePage === 'tools' || activePage.startsWith('tool-') ? 'bg-emerald-100 text-emerald-700' : ''}`}>
              <Calculator className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5">Tools</span>
          </button>
        </nav>
      </div>

      {/* Official Form 1 Show-Cause Notice Modal */}
      {currentReport && (
        <NoticeGeneratorModal
          isOpen={isNoticeModalOpen}
          onClose={() => setIsNoticeModalOpen(false)}
          report={currentReport}
        />
      )}

      {/* AI Artwork & Print Plate Remediation Modal */}
      {currentReport && (
        <ArtworkRemediationModal
          isOpen={isRemediationModalOpen}
          onClose={() => setIsRemediationModalOpen(false)}
          report={currentReport}
        />
      )}

      {/* Schedule I Net Weight Tolerance Scale Modal */}
      {currentReport && (
        <WeightToleranceModal
          isOpen={isWeightToleranceModalOpen}
          onClose={() => setIsWeightToleranceModalOpen(false)}
          report={currentReport}
        />
      )}

      {/* Backend Server Connection Settings Modal */}
      <BackendConnectionModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
      />
    </div>
  );
}
