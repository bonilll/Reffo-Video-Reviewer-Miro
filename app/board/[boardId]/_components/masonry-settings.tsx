import React, { useState } from "react";
import type { MasonrySettings } from "@/lib/utils";

type MasonrySettingsProps = {
  onApply: (settings: MasonrySettings) => void;
  onClose: () => void;
};

export const MasonrySettingsModal = ({ onApply, onClose }: MasonrySettingsProps) => {
  const [settings, setSettings] = useState<MasonrySettings>({
    columns: 3,
    gapX: 24,
    gapY: 24,
    normalizeWidth: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(settings);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[320px] shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Impostazioni Masonry Grid</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Numero di colonne
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={settings.columns}
              onChange={(e) => setSettings(prev => ({ ...prev, columns: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Spaziatura orizzontale (px)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.gapX}
              onChange={(e) => setSettings(prev => ({ ...prev, gapX: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Spaziatura verticale (px)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.gapY}
              onChange={(e) => setSettings(prev => ({ ...prev, gapY: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="normalizeWidth"
              checked={settings.normalizeWidth}
              onChange={(e) => setSettings(prev => ({ ...prev, normalizeWidth: e.target.checked }))}
              className="mr-2"
            />
            <label htmlFor="normalizeWidth" className="text-sm font-medium">
              Normalizza larghezza
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-black/90 rounded-md"
            >
              Applica
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 