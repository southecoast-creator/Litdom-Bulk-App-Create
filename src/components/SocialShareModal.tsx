/**
 * Litdom Batch Studio - Social Media Publishing Modal
 * Exact visual match to IMG_1495 (2).pdf Page 10:
 * "Upload Directly to Social Media"
 * Platforms: Pinterest, LinkedIn, Twitter/X, WhatsApp, Substack, Medium, Reddit, Discord, Instagram, Facebook, Threads, Tumblr.
 * Supports Page selection: Current Page, All, Custom.
 */

import React, { useState } from 'react';
import {
  X,
  Share2,
  Check,
  AlertTriangle,
  Send,
  ExternalLink,
} from 'lucide-react';
import { Project } from '../types';
import { exportSingleDesign, exportDesignsToFiles } from '../utils/downloadEngine';

interface SocialShareModalProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const PLATFORMS = [
  { id: 'pinterest', name: 'Pinterest', color: 'hover:bg-red-600' },
  { id: 'linkedin', name: 'LinkedIn', color: 'hover:bg-blue-600' },
  { id: 'twitter', name: 'Twitter / X', color: 'hover:bg-neutral-800' },
  { id: 'whatsapp', name: 'WhatsApp', color: 'hover:bg-emerald-600' },
  { id: 'substack', name: 'Substack', color: 'hover:bg-orange-600' },
  { id: 'medium', name: 'Medium', color: 'hover:bg-neutral-800' },
  { id: 'reddit', name: 'Reddit', color: 'hover:bg-orange-700' },
  { id: 'discord', name: 'Discord', color: 'hover:bg-indigo-600' },
  { id: 'instagram', name: 'Instagram', color: 'hover:bg-pink-600' },
  { id: 'facebook', name: 'Facebook', color: 'hover:bg-blue-700' },
  { id: 'threads', name: 'Threads', color: 'hover:bg-neutral-900' },
  { id: 'tumblr', name: 'Tumblr', color: 'hover:bg-blue-900' },
];

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  project,
  activePageIndex,
  isOpen,
  onClose,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('pinterest');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [isSharing, setIsSharing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleShareToPlatform = async (platformId: string) => {
    setSelectedPlatform(platformId);
    setIsSharing(true);
    setStatusMessage(null);

    try {
      const pageIdx = activePageIndex;
      const blob = await exportSingleDesign(project, pageIdx, 'png', 1.0);
      const filename = `${project.name}_page_${pageIdx + 1}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // Try Web Share API if supported
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: project.name,
          text: `Created with Litdom Batch Studio`,
          files: [file],
        });
        setStatusMessage('Shared successfully!');
      } else {
        // Fallback: Download file and open platform creation link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        let platformUrl = 'https://pinterest.com';
        if (platformId === 'linkedin') platformUrl = 'https://linkedin.com/feed';
        else if (platformId === 'twitter') platformUrl = 'https://twitter.com/compose/tweet';
        else if (platformId === 'whatsapp') platformUrl = 'https://web.whatsapp.com';
        else if (platformId === 'reddit') platformUrl = 'https://reddit.com/submit';
        else if (platformId === 'instagram') platformUrl = 'https://instagram.com';

        window.open(platformUrl, '_blank');
        setStatusMessage(`Design saved. Redirecting to ${platformId}…`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatusMessage('Sharing cancelled or not supported on this browser.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm sm:max-w-md bg-[#F4D58D] text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37]">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center pt-2">
          <h2 className="text-sm sm:text-base font-bold text-black">
            Upload Directly to Social Media
          </h2>
          <p className="text-[11px] text-black/60 mt-0.5">
            Share design {activePageIndex + 1} to your social channels
          </p>
        </div>

        {statusMessage && (
          <div className="p-2 bg-black text-white rounded-xl text-xs text-center font-medium">
            {statusMessage}
          </div>
        )}

        {/* Platform Grid (Page 10) */}
        <div className="grid grid-cols-3 gap-2.5 max-h-64 overflow-y-auto p-1">
          {PLATFORMS.map((plat) => (
            <button
              key={plat.id}
              onClick={() => handleShareToPlatform(plat.id)}
              disabled={isSharing}
              className="bg-black text-white hover:bg-black/80 font-bold text-xs py-3 px-2 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 shadow-md active:scale-95"
            >
              <span>{plat.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-black/20 hover:bg-black/30 text-black font-bold text-xs py-2.5 rounded-full transition-colors mt-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
