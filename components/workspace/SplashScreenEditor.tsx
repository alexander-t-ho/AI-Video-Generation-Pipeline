'use client';

import { useState } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import { SplashScreen, SplashLogo, SplashText } from '@/lib/types';
import { Plus, X, Copy, Upload, Type as TypeIcon, Image as ImageIcon, Trash2 } from 'lucide-react';

/**
 * Splash Screen Editor Component
 * Design and manage splash screens (end cards) with logos and text
 */
export function SplashScreenEditor() {
  const splashScreens = useProjectStore((state) => state.splashScreens);
  const selectedSplashScreenId = useProjectStore((state) => state.selectedSplashScreenId);
  const addSplashScreen = useProjectStore((state) => state.addSplashScreen);
  const deleteSplashScreen = useProjectStore((state) => state.deleteSplashScreen);
  const updateSplashScreen = useProjectStore((state) => state.updateSplashScreen);
  const setSelectedSplashScreenId = useProjectStore((state) => state.setSelectedSplashScreenId);
  const duplicateSplashScreen = useProjectStore((state) => state.duplicateSplashScreen);

  const addSplashLogo = useProjectStore((state) => state.addSplashLogo);
  const deleteSplashLogo = useProjectStore((state) => state.deleteSplashLogo);
  const updateSplashLogo = useProjectStore((state) => state.updateSplashLogo);

  const addSplashText = useProjectStore((state) => state.addSplashText);
  const deleteSplashText = useProjectStore((state) => state.deleteSplashText);
  const updateSplashText = useProjectStore((state) => state.updateSplashText);

  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddLogoDialog, setShowAddLogoDialog] = useState(false);
  const [newLogoUrl, setNewLogoUrl] = useState('');

  const selectedSplash = splashScreens.find((s) => s.id === selectedSplashScreenId);

  const handleAddSplashScreen = () => {
    addSplashScreen('End Card', 3);
  };

  const handleDeleteSplash = (splashId: string) => {
    if (confirm('Delete this splash screen?')) {
      deleteSplashScreen(splashId);
    }
  };

  const handleDuplicateSplash = (splashId: string) => {
    duplicateSplashScreen(splashId);
  };

  const handleAddLogo = () => {
    if (!selectedSplash || !newLogoUrl) return;
    addSplashLogo(selectedSplash.id, newLogoUrl);
    setNewLogoUrl('');
    setShowAddLogoDialog(false);
  };

  const handleAddText = () => {
    if (!selectedSplash) return;
    addSplashText(selectedSplash.id, 'New Text');
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="text-sm font-semibold text-white">Splash Screens (End Cards)</h3>
          <span className="text-xs text-gray-500">({splashScreens.length})</span>
        </div>
        <button
          onClick={handleAddSplashScreen}
          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Splash Screen
        </button>
      </div>

      {/* Splash Screen List */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto">
          {splashScreens.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No splash screens yet. Click "Add Splash Screen" to create an end card.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {splashScreens.map((splash) => (
                <SplashScreenListItem
                  key={splash.id}
                  splash={splash}
                  isSelected={splash.id === selectedSplashScreenId}
                  onSelect={() => setSelectedSplashScreenId(splash.id)}
                  onDelete={() => handleDeleteSplash(splash.id)}
                  onDuplicate={() => handleDuplicateSplash(splash.id)}
                  onUpdate={(updates) => updateSplashScreen(splash.id, updates)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Property Panel for Selected Splash */}
      {selectedSplash && (
        <div className="border-t border-gray-700 bg-gray-800/50">
          <SplashScreenPropertyPanel
            splash={selectedSplash}
            onUpdate={(updates) => updateSplashScreen(selectedSplash.id, updates)}
            onAddLogo={() => setShowAddLogoDialog(true)}
            onAddText={handleAddText}
            onDeleteLogo={(logoId) => deleteSplashLogo(selectedSplash.id, logoId)}
            onUpdateLogo={(logoId, updates) => updateSplashLogo(selectedSplash.id, logoId, updates)}
            onDeleteText={(textId) => deleteSplashText(selectedSplash.id, textId)}
            onUpdateText={(textId, updates) => updateSplashText(selectedSplash.id, textId, updates)}
          />
        </div>
      )}

      {/* Add Logo Dialog */}
      {showAddLogoDialog && selectedSplash && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowAddLogoDialog(false)}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-lg p-6 w-96 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Logo</h3>
              <button
                onClick={() => setShowAddLogoDialog(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-2">Logo Image URL</label>
                <input
                  type="text"
                  placeholder="https://example.com/logo.png"
                  value={newLogoUrl}
                  onChange={(e) => setNewLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddLogoDialog(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLogo}
                  disabled={!newLogoUrl}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Add Logo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual splash screen list item
 */
function SplashScreenListItem({
  splash,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onUpdate,
}: {
  splash: SplashScreen;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdate: (updates: Partial<SplashScreen>) => void;
}) {
  return (
    <div
      className={`p-3 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-900/30 border-l-2 border-blue-500' : 'hover:bg-gray-800'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={splash.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-white text-sm font-medium outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 transition-colors"
            placeholder="Splash screen title..."
          />
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{splash.duration.toFixed(1)}s</span>
            <span>•</span>
            <span>{splash.logos.length} logos</span>
            <span>•</span>
            <span>{splash.textElements.length} text elements</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Duplicate"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Preview */}
      <div
        className="mt-2 h-20 rounded relative overflow-hidden"
        style={{
          backgroundColor: splash.backgroundColor,
        }}
      >
        {splash.backgroundImageUrl && (
          <img
            src={splash.backgroundImageUrl}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: splash.backgroundImageOpacity }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
          Preview
        </div>
      </div>
    </div>
  );
}

/**
 * Splash Screen Property Panel
 */
function SplashScreenPropertyPanel({
  splash,
  onUpdate,
  onAddLogo,
  onAddText,
  onDeleteLogo,
  onUpdateLogo,
  onDeleteText,
  onUpdateText,
}: {
  splash: SplashScreen;
  onUpdate: (updates: Partial<SplashScreen>) => void;
  onAddLogo: () => void;
  onAddText: () => void;
  onDeleteLogo: (logoId: string) => void;
  onUpdateLogo: (logoId: string, updates: Partial<SplashLogo>) => void;
  onDeleteText: (textId: string) => void;
  onUpdateText: (textId: string, updates: Partial<SplashText>) => void;
}) {
  const [activeTab, setActiveTab] = useState<'settings' | 'logos' | 'text'>('settings');

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'settings', label: 'Settings' },
          { id: 'logos', label: `Logos (${splash.logos.length})` },
          { id: 'text', label: `Text (${splash.textElements.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3 max-h-64 overflow-y-auto">
        {activeTab === 'settings' && <SettingsTab splash={splash} onUpdate={onUpdate} />}
        {activeTab === 'logos' && (
          <LogosTab
            splash={splash}
            onAddLogo={onAddLogo}
            onDeleteLogo={onDeleteLogo}
            onUpdateLogo={onUpdateLogo}
          />
        )}
        {activeTab === 'text' && (
          <TextTab
            splash={splash}
            onAddText={onAddText}
            onDeleteText={onDeleteText}
            onUpdateText={onUpdateText}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Settings Tab
 */
function SettingsTab({
  splash,
  onUpdate,
}: {
  splash: SplashScreen;
  onUpdate: (updates: Partial<SplashScreen>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-300 mb-1">Duration (seconds)</label>
        <input
          type="number"
          value={splash.duration}
          onChange={(e) => onUpdate({ duration: parseFloat(e.target.value) || 1 })}
          step="0.5"
          min="0.5"
          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-300 mb-1">Background Color</label>
        <input
          type="color"
          value={splash.backgroundColor}
          onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
          className="w-full h-8 bg-gray-700 border border-gray-600 rounded cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-300 mb-1">Background Image URL</label>
        <input
          type="text"
          value={splash.backgroundImageUrl || ''}
          onChange={(e) => onUpdate({ backgroundImageUrl: e.target.value || undefined })}
          placeholder="https://example.com/background.jpg"
          className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {splash.backgroundImageUrl && (
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Background Image Opacity
          </label>
          <input
            type="range"
            value={splash.backgroundImageOpacity * 100}
            onChange={(e) => onUpdate({ backgroundImageOpacity: parseFloat(e.target.value) / 100 })}
            min="0"
            max="100"
            step="1"
            className="w-full"
          />
          <div className="text-xs text-gray-400 mt-1">
            {(splash.backgroundImageOpacity * 100).toFixed(0)}%
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Fade In (s)</label>
          <input
            type="number"
            value={splash.fadeIn}
            onChange={(e) => onUpdate({ fadeIn: parseFloat(e.target.value) || 0 })}
            step="0.1"
            min="0"
            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Fade Out (s)</label>
          <input
            type="number"
            value={splash.fadeOut}
            onChange={(e) => onUpdate({ fadeOut: parseFloat(e.target.value) || 0 })}
            step="0.1"
            min="0"
            className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Logos Tab
 */
function LogosTab({
  splash,
  onAddLogo,
  onDeleteLogo,
  onUpdateLogo,
}: {
  splash: SplashScreen;
  onAddLogo: () => void;
  onDeleteLogo: (logoId: string) => void;
  onUpdateLogo: (logoId: string, updates: Partial<SplashLogo>) => void;
}) {
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const selectedLogo = splash.logos.find((l) => l.id === selectedLogoId);

  return (
    <div className="space-y-3">
      <button
        onClick={onAddLogo}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Logo
      </button>

      {splash.logos.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-4">No logos added yet</div>
      ) : (
        <div className="space-y-2">
          {splash.logos.map((logo) => (
            <div
              key={logo.id}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                selectedLogoId === logo.id
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setSelectedLogoId(logo.id)}
            >
              <div className="flex items-center gap-2">
                <img
                  src={logo.imageUrl}
                  alt="Logo"
                  className="w-12 h-12 object-contain bg-gray-800 rounded"
                />
                <div className="flex-1 min-w-0 text-xs text-gray-400">
                  <div>{logo.width}x{logo.height}px</div>
                  <div>Pos: ({(logo.x * 100).toFixed(0)}%, {(logo.y * 100).toFixed(0)}%)</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLogo(logo.id);
                    if (selectedLogoId === logo.id) setSelectedLogoId(null);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLogo && (
        <div className="mt-4 p-3 border border-gray-600 rounded space-y-3">
          <h4 className="text-sm font-medium text-white">Edit Logo</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Width (px)</label>
              <input
                type="number"
                value={selectedLogo.width}
                onChange={(e) => onUpdateLogo(selectedLogo.id, { width: parseInt(e.target.value) || 100 })}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Height (px)</label>
              <input
                type="number"
                value={selectedLogo.height}
                onChange={(e) => onUpdateLogo(selectedLogo.id, { height: parseInt(e.target.value) || 100 })}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">X Position (%)</label>
              <input
                type="range"
                value={selectedLogo.x * 100}
                onChange={(e) => onUpdateLogo(selectedLogo.id, { x: parseFloat(e.target.value) / 100 })}
                min="0"
                max="100"
                className="w-full"
              />
              <div className="text-xs text-gray-400">{(selectedLogo.x * 100).toFixed(0)}%</div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Y Position (%)</label>
              <input
                type="range"
                value={selectedLogo.y * 100}
                onChange={(e) => onUpdateLogo(selectedLogo.id, { y: parseFloat(e.target.value) / 100 })}
                min="0"
                max="100"
                className="w-full"
              />
              <div className="text-xs text-gray-400">{(selectedLogo.y * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Opacity</label>
            <input
              type="range"
              value={selectedLogo.opacity * 100}
              onChange={(e) => onUpdateLogo(selectedLogo.id, { opacity: parseFloat(e.target.value) / 100 })}
              min="0"
              max="100"
              className="w-full"
            />
            <div className="text-xs text-gray-400">{(selectedLogo.opacity * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Text Tab
 */
function TextTab({
  splash,
  onAddText,
  onDeleteText,
  onUpdateText,
}: {
  splash: SplashScreen;
  onAddText: () => void;
  onDeleteText: (textId: string) => void;
  onUpdateText: (textId: string, updates: Partial<SplashText>) => void;
}) {
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const selectedText = splash.textElements.find((t) => t.id === selectedTextId);

  return (
    <div className="space-y-3">
      <button
        onClick={onAddText}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Text
      </button>

      {splash.textElements.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-4">No text elements added yet</div>
      ) : (
        <div className="space-y-2">
          {splash.textElements.map((text) => (
            <div
              key={text.id}
              className={`p-2 rounded border transition-colors cursor-pointer ${
                selectedTextId === text.id
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setSelectedTextId(text.id)}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{text.text}</div>
                  <div className="text-xs text-gray-400">
                    {text.fontSize}px • {text.fontFamily}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteText(text.id);
                    if (selectedTextId === text.id) setSelectedTextId(null);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedText && (
        <div className="mt-4 p-3 border border-gray-600 rounded space-y-3">
          <h4 className="text-sm font-medium text-white">Edit Text</h4>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Text Content</label>
            <textarea
              value={selectedText.text}
              onChange={(e) => onUpdateText(selectedText.id, { text: e.target.value })}
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm resize-none"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Font Size (px)</label>
              <input
                type="number"
                value={selectedText.fontSize}
                onChange={(e) => onUpdateText(selectedText.id, { fontSize: parseInt(e.target.value) || 12 })}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Font Color</label>
              <input
                type="color"
                value={selectedText.fontColor}
                onChange={(e) => onUpdateText(selectedText.id, { fontColor: e.target.value })}
                className="w-full h-8 bg-gray-700 border border-gray-600 rounded cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">X Position (%)</label>
              <input
                type="range"
                value={selectedText.x * 100}
                onChange={(e) => onUpdateText(selectedText.id, { x: parseFloat(e.target.value) / 100 })}
                min="0"
                max="100"
                className="w-full"
              />
              <div className="text-xs text-gray-400">{(selectedText.x * 100).toFixed(0)}%</div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Y Position (%)</label>
              <input
                type="range"
                value={selectedText.y * 100}
                onChange={(e) => onUpdateText(selectedText.id, { y: parseFloat(e.target.value) / 100 })}
                min="0"
                max="100"
                className="w-full"
              />
              <div className="text-xs text-gray-400">{(selectedText.y * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
