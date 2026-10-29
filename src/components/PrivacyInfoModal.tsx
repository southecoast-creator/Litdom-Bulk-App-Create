/**
 * Litdom Batch Studio - Privacy & Independent Hosting Documentation Modal
 * Clear explanations of data ownership, zero-tracking, GitHub sync, and free static hosting.
 */
import React from 'react';
import { X, ShieldCheck, HardDrive, GitBranch, Globe, AlertTriangle, CheckCircle } from 'lucide-react';

interface PrivacyInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyInfoModal: React.FC<PrivacyInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#17171C] border border-[#212128] rounded-2xl max-w-2xl w-full p-6 text-xs text-[#FFF8E7] space-y-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#212128]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#FFF8E7]">
                Privacy, Architecture & Hosting Guide
              </h3>
              <p className="text-[11px] text-[#F4D58D]/70">
                100% Client-Side Engine · Zero Data Collection · Standalone Portability
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#FFF8E7]/50 hover:text-[#FFF8E7] hover:bg-[#212128]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 6 Core Architectural Answers */}
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* 1. Which files remain on your device? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-[#212128] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
              <HardDrive className="w-4 h-4 shrink-0" />
              <span>1. Which files remain on your device?</span>
            </div>
            <p className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
              <strong>All of them.</strong> Every background image you upload, every custom font file (.ttf / .otf), every spreadsheet (CSV/XLSX), and all rendered artwork are processed directly in your device’s browser memory and canvas engine. No file is ever transmitted over the network to external servers.
            </p>
          </div>

          {/* 2. Which project files are stored in GitHub? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-[#212128] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
              <GitBranch className="w-4 h-4 shrink-0" />
              <span>2. Which project files are stored in the GitHub repository?</span>
            </div>
            <p className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
              Only the <strong>application source code</strong> (HTML, TypeScript, React components, CSS, and package configuration) is stored in the Git repository. Your personal designs, client spreadsheets, and generated output are <strong>never committed to GitHub</strong>.
            </p>
          </div>

          {/* 3. Which data is stored in browser-local storage? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-[#212128] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>3. Which data is stored in browser-local storage?</span>
            </div>
            <p className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
              The app stores project metadata, text-box definitions, background image data, and uploaded custom fonts inside the browser's <strong>IndexedDB database (<code className="text-[#F4D58D]">litdom_batch_studio_db</code>)</strong>. This storage is sandbox-isolated strictly to this origin.
            </p>
          </div>

          {/* 4. Does any external service receive your content? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-[#212128] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>4. Does any external service receive your uploaded content?</span>
            </div>
            <p className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
              <strong>No. Zero external network transmission.</strong> Spreadsheet parsing (<code className="text-[#F4D58D]">xlsx</code>), font registration (<code className="text-[#F4D58D]">FontFace API</code>), PDF compilation (<code className="text-[#F4D58D]">jsPDF</code>), and ZIP archiving (<code className="text-[#F4D58D]">JSZip</code>) run 100% client-side inside WebAssembly / JavaScript.
            </p>
          </div>

          {/* 5. What happens if you clear browser data? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-amber-900/60 bg-amber-950/20 space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>5. What happens if you clear browser data or switch devices?</span>
            </div>
            <p className="text-amber-100/80 text-[11px] leading-relaxed">
              Because IndexedDB is stored locally in the specific browser profile, clearing browsing data / site storage or opening the studio in another browser will start with a fresh environment.
              <br />
              <strong className="text-white">Solution:</strong> Use the <strong>"Backup Project"</strong> button in Stage 1 (Projects) to save a <code className="text-[#F4D58D]">.litdom.json</code> backup file anytime. You can then hit <strong>"Restore Backup"</strong> on any device or browser to restore all pages, layouts, and fonts immediately!
            </p>
          </div>

          {/* 6. Which free static hosting options support this app? */}
          <div className="p-3.5 bg-[#0B0B0F] rounded-xl border border-[#212128] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#D4AF37]">
              <Globe className="w-4 h-4 shrink-0" />
              <span>6. Recommended 100% Free Static Web Hosts</span>
            </div>
            <p className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
              Because Litdom Batch Studio has zero backend dependencies, it can be deployed to any free static host by running <code className="text-[#F4D58D]">npm run build</code> and serving the <code className="text-[#F4D58D]">dist/</code> directory:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-[#FFF8E7]/70 pt-1">
              <li><strong>GitHub Pages</strong>: Free hosting directly from your GitHub repo.</li>
              <li><strong>Cloudflare Pages</strong>: Unlimited bandwidth, global edge CDN, zero cost.</li>
              <li><strong>Vercel / Netlify</strong>: Instant Git-push deployments on free tiers.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#212128] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold rounded-lg text-xs transition-all"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
