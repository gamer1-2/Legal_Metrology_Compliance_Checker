import React from 'react';
import { Camera, Layers, ShieldCheck, Calculator, FolderArchive, BarChart3, BookOpen, Scale, PlusCircle, UserCircle2, ChevronLeft, ChevronRight, X, Barcode, QrCode } from 'lucide-react';
import { UserRole } from '../types/compliance';

export type AppPage = 'scan' | 'studio' | 'report' | 'barcode' | 'qr' | 'tool-font' | 'tool-usp' | 'tool-mpe' | 'tool-penalty' | 'tool-server' | 'tools' | 'cases' | 'dashboard' | 'handbook';
interface SidebarProps { activePage: AppPage; onSelectPage: (page: AppPage) => void; userRole: UserRole; onChangeRole: (role: UserRole) => void; hasCurrentReport: boolean; unresolvedViolationsCount: number; isCollapsed: boolean; onToggleCollapse: () => void; onStartNewScan: () => void; isMobileMenu?: boolean; onCloseMobileMenu?: () => void; }

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onSelectPage, userRole, onChangeRole, hasCurrentReport, unresolvedViolationsCount, isCollapsed, onToggleCollapse, onStartNewScan, isMobileMenu = false, onCloseMobileMenu }) => {
  const groups = [
    { title: 'INSPECTION', items: [
      { id: 'scan' as AppPage, label: 'New inspection', icon: Camera },
      { id: 'report' as AppPage, label: 'Inspection report', icon: ShieldCheck, disabled: !hasCurrentReport, badge: hasCurrentReport && unresolvedViolationsCount ? `${unresolvedViolationsCount}` : undefined },
      { id: 'studio' as AppPage, label: 'Evidence studio', icon: Layers, disabled: !hasCurrentReport },
    ]},
    { title: 'RECORDS', items: [
      { id: 'cases' as AppPage, label: 'Inspection history', icon: FolderArchive },
      { id: 'dashboard' as AppPage, label: 'Overview', icon: BarChart3 },
    ]},
    { title: 'VERIFICATION', items: [
      { id: 'barcode' as AppPage, label: 'Barcode provenance', icon: Barcode },
      { id: 'qr' as AppPage, label: 'Smart QR audit', icon: QrCode },
    ]},
    { title: 'REFERENCE', items: [
      { id: 'tools' as AppPage, label: 'Calculators & checkers', icon: Calculator },
      { id: 'handbook' as AppPage, label: 'Standards guide', icon: BookOpen },
    ]},
  ];
  const roleLabel = userRole === 'INSPECTOR' ? 'Field inspector' : userRole === 'CONTROLLER' ? 'Supervisory officer' : 'Quality auditor';
  return <aside className={`bg-slate-900 text-white border-r border-slate-800 flex flex-col z-30 shrink-0 select-none print:hidden ${isMobileMenu ? 'w-72 max-w-[85vw]' : isCollapsed ? 'w-18' : 'w-64'}`}>
    <div>
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        {(!isCollapsed || isMobileMenu) ? <div className="flex items-center gap-3 min-w-0"><div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0"><Scale className="w-5 h-5" /></div><div className="min-w-0"><div className="text-sm font-bold truncate">Metrology Desk</div><div className="text-[10px] text-slate-400 font-mono tracking-wide">LM / INSPECTION OS</div></div></div> : <div className="w-9 h-9 mx-auto rounded-lg bg-emerald-600 flex items-center justify-center"><Scale className="w-5 h-5" /></div>}
        {isMobileMenu && onCloseMobileMenu ? <button onClick={onCloseMobileMenu} className="p-1.5 text-slate-400 hover:text-white" aria-label="Close menu"><X className="w-5 h-5" /></button> : <button onClick={onToggleCollapse} className="p-1 text-slate-400 hover:text-white" aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</button>}
      </div>
      <div className="p-3"><button onClick={onStartNewScan} className={`w-full py-2.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 ${isCollapsed ? 'px-0' : ''}`}><PlusCircle className="w-4 h-4" />{!isCollapsed && <span>Start inspection</span>}</button></div>
      <nav className="px-2 space-y-4" aria-label="Primary navigation">{groups.map((group) => <div key={group.title}><div className={`${isCollapsed ? 'hidden' : 'block'} px-3 mb-1 text-[10px] text-slate-500 font-mono tracking-[.16em]`}>{group.title}</div>{group.items.map((item) => { const Icon = item.icon; const active = activePage === item.id || (item.id === 'tools' && activePage.startsWith('tool-')); return <button key={item.id} disabled={item.disabled} onClick={() => !item.disabled && onSelectPage(item.id)} title={item.label} className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold ${isCollapsed ? 'justify-center px-0' : ''} ${active ? 'bg-slate-800 text-white border-l-2 border-orange-500' : item.disabled ? 'text-slate-600 opacity-50 cursor-not-allowed' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}><Icon className={`w-4 h-4 shrink-0 ${active ? 'text-orange-400' : 'text-slate-400'}`} />{!isCollapsed && <span className="truncate">{item.label}</span>}{!isCollapsed && item.badge && <span className="ml-auto text-[10px] bg-rose-500 text-white px-1.5 rounded-sm font-mono">{item.badge}</span>}</button>})}</div>)}</nav>
    </div>
    <div className="p-3 mt-auto border-t border-slate-800">{!isCollapsed ? <div className="p-2.5 bg-slate-800/60 flex items-center gap-2"><UserCircle2 className="w-4 h-4 text-orange-400 shrink-0" /><div className="min-w-0 flex-1"><div className="text-[10px] text-slate-500 font-mono">ACTIVE ROLE</div><div className="text-xs font-semibold truncate">{roleLabel}</div></div><select value={userRole} onChange={e => onChangeRole(e.target.value as UserRole)} className="w-5 bg-transparent text-transparent border-0" aria-label="Change role"><option value="INSPECTOR">Inspector</option><option value="CONTROLLER">Supervisor</option><option value="MANUFACTURER_AUDITOR">Auditor</option></select></div> : <div className="flex justify-center" title={roleLabel}><UserCircle2 className="w-5 h-5 text-orange-400" /></div>}</div>
  </aside>;
};
