import React from 'react';
import { BarChart3, AlertTriangle, CheckCircle2, ArrowUpRight, ShieldAlert, Building2, Clock3, ScanLine } from 'lucide-react';
import { InspectionResult } from '../types/compliance';

interface DashboardViewProps { inspections: InspectionResult[]; onSelectInspection: (inspection: InspectionResult) => void; }

export const DashboardView: React.FC<DashboardViewProps> = ({ inspections, onSelectInspection }) => {
  const total = inspections.length;
  const compliant = inspections.filter(x => x.overallVerdict === 'COMPLIANT').length;
  const nonCompliant = inspections.filter(x => x.overallVerdict === 'NON_COMPLIANT').length;
  const serious = inspections.filter(x => x.overallVerdict === 'SERIOUS_VIOLATION').length;
  const complianceRate = total ? Math.round((compliant / total) * 100) : 0;
  const count = (fn: (x: InspectionResult) => boolean) => inspections.filter(fn).length;
  const findings = [
    ['Unit sale price', count(x => !x.declarations.unitSalePrice?.isCompliant), 'Pricing requirement'],
    ['Standard metric units', count(x => !x.declarations.netQuantity?.isStandardUnit || !!x.declarations.netQuantity?.hasProhibitedQualifiers), 'Units requirement'],
    ['Consumer care contact', count(x => !x.declarations.consumerCare?.emailId), 'Support requirement'],
    ['Minimum font height', count(x => !x.readability?.isFontHeightCompliant), 'Readability standard'],
    ['All-inclusive MRP', count(x => !!x.declarations.mrp?.hasTaxesExtraViolation), 'Pricing standard'],
  ];
  const verdict = (item: InspectionResult) => item.overallVerdict === 'COMPLIANT' ? { label: 'COMPLIANT', cls: 'text-[#2f6b4f] bg-[#dcebe2]' } : item.overallVerdict === 'SERIOUS_VIOLATION' ? { label: 'SERIOUS', cls: 'text-[#b93832] bg-[#f3d9d7]' } : { label: 'REVIEW', cls: 'text-[#a66a16] bg-[#f3e5c7]' };
  return <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-7 space-y-7">
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#d8d3c8] pb-6">
      <div><div className="font-mono text-[10px] tracking-[.2em] text-[#b38a3e] mb-3">01 / OVERVIEW</div><h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#171717]">Inspection command center</h1><p className="text-sm text-[#77746d] mt-2 max-w-xl">A live view of field activity, declaration integrity, and items requiring officer attention.</p></div>
      <div className="font-mono text-[11px] text-[#77746d]">DATASET / LOCAL REPOSITORY<br/><span className="text-[#171717]">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</span></div>
    </header>
    <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_.65fr] gap-5">
      <div className="bg-[#171717] text-[#fffcf6] p-6 md:p-8 relative overflow-hidden min-h-[230px] flex flex-col justify-between"><div className="absolute right-0 top-0 w-40 h-full opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, transparent 49%, #f7f4ed 50%, transparent 51%), linear-gradient(0deg, transparent 49%, #f7f4ed 50%, transparent 51%)', backgroundSize: '20px 20px' }} /><div className="relative"><div className="flex items-center gap-2 text-[#f7d8ce] text-xs font-mono tracking-wider"><ScanLine className="w-4 h-4" /> FIELD ACTIVITY</div><div className="text-6xl font-bold mt-5 tracking-tight">{total.toString().padStart(2, '0')}</div><div className="text-sm text-[#bdb9b0] mt-1">packaged commodities inspected</div></div><div className="relative flex items-center gap-3 text-xs"><span className="w-2 h-2 bg-[#e4572e] rounded-full" /> Repository is ready for the next inspection</div></div>
      <div className="bg-[#fffcf6] border border-[#d8d3c8] p-6 flex flex-col justify-between"><div className="flex items-center justify-between"><span className="font-mono text-[10px] tracking-wider text-[#77746d]">DECLARATION INTEGRITY</span><CheckCircle2 className="w-5 h-5 text-[#2f6b4f]" /></div><div><div className="text-5xl font-bold mt-8 text-[#2f6b4f]">{complianceRate}<span className="text-2xl">%</span></div><p className="text-sm text-[#77746d] mt-1">passing all recorded checks</p></div><div className="h-1.5 bg-[#eeebe3] mt-5"><div className="h-full bg-[#2f6b4f]" style={{ width: `${complianceRate}%` }} /></div></div>
    </section>
    <section className="grid grid-cols-2 lg:grid-cols-4 border-y border-[#d8d3c8] bg-[#fffcf6]">
      {[['COMPLIANT', compliant, 'text-[#2f6b4f]'], ['REVIEW REQUIRED', nonCompliant, 'text-[#a66a16]'], ['SERIOUS VIOLATIONS', serious, 'text-[#b93832]'], ['REFERRAL VALUE', `₹${((nonCompliant + serious) * 25000).toLocaleString('en-IN')}`, 'text-[#171717]']].map(([label, value, cls], i) => <div key={label} className={`p-5 ${i ? 'border-l border-[#d8d3c8]' : ''}`}><div className="font-mono text-[10px] text-[#77746d] tracking-wider">{label}</div><div className={`text-2xl font-bold mt-3 ${cls}`}>{value}</div></div>)}
    </section>
    <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-5">
      <div className="bg-[#fffcf6] border border-[#d8d3c8] p-6"><div className="flex items-start justify-between mb-6"><div><div className="font-mono text-[10px] tracking-wider text-[#b38a3e]">02 / FINDINGS</div><h2 className="text-lg font-bold mt-2">Most frequent discrepancies</h2></div><ShieldAlert className="w-5 h-5 text-[#b93832]" /></div><div className="space-y-5">{findings.map(([label, value, ref]) => { const pct = total ? Math.round((Number(value) / total) * 100) : 0; return <div key={label}><div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="font-mono text-xs text-[#77746d]">{value} / {total}</span></div><div className="h-1.5 bg-[#eeebe3] mt-2"><div className={`h-full ${Number(value) ? 'bg-[#e4572e]' : 'bg-[#d8d3c8]'}`} style={{ width: `${Math.max(Number(value) ? pct : 0, Number(value) ? 5 : 0)}%` }} /></div><div className="font-mono text-[10px] text-[#77746d] mt-1">{ref}</div></div>})}</div></div>
      <div className="bg-[#eeebe3] border border-[#d8d3c8] p-6"><div className="font-mono text-[10px] tracking-wider text-[#b38a3e]">03 / PRIORITY QUEUE</div><h2 className="text-lg font-bold mt-2 mb-5">Recent inspections</h2>{inspections.length === 0 ? <div className="py-12 text-center text-sm text-[#77746d] border-t border-[#d8d3c8]">No field records yet.<br/>Start an inspection to populate this queue.</div> : <div className="space-y-1">{inspections.slice(0, 5).map(item => { const v = verdict(item); return <button key={item.id} onClick={() => onSelectInspection(item)} className="w-full text-left flex items-center gap-3 py-3 border-t border-[#d8d3c8] hover:bg-[#f7f4ed] px-2 -mx-2"><span className={`w-2 h-2 rounded-full ${item.overallVerdict === 'COMPLIANT' ? 'bg-[#2f6b4f]' : item.overallVerdict === 'SERIOUS_VIOLATION' ? 'bg-[#b93832]' : 'bg-[#a66a16]'}`} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{item.productName}</span><span className="font-mono text-[10px] text-[#77746d]">{item.id}</span></span><span className={`text-[10px] font-mono px-1.5 py-1 ${v.cls}`}>{v.label}</span><ArrowUpRight className="w-4 h-4 text-[#77746d]" /></button>})}</div>}</div>
    </section>
    <div className="flex flex-wrap gap-4 text-[11px] text-[#77746d] font-mono"><span className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5" /> RECORDS / {total}</span><span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> LMPC / 2011 + USP / 2022</span><span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {nonCompliant + serious} REFERRALS</span></div>
  </div>;
};
