'use client';

import { useMemo, useState } from 'react';
import { Search, Car, Wrench, Plus, X } from 'lucide-react';
import { CarVariant, CustomAsset } from './types';

interface CarSelectorProps {
  cars: CarVariant[];
  customAssets: CustomAsset[];
  selectedCar: CarVariant | CustomAsset | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCarSelect: (car: CarVariant | CustomAsset) => void;
  onAddCustomAsset?: (baseCarId: string, name: string) => void;
  onRemoveCustomAsset?: (assetId: string) => void;
}

export default function CarSelector({
  cars,
  customAssets,
  selectedCar,
  searchQuery,
  onSearchChange,
  onCarSelect,
  onAddCustomAsset,
  onRemoveCustomAsset
}: CarSelectorProps) {
  const [isCustomAssetModalOpen, setIsCustomAssetModalOpen] = useState(false);
  const [customAssetName, setCustomAssetName] = useState('');
  const filteredCars = useMemo(() => {
    if (!searchQuery.trim()) return cars;

    const query = searchQuery.toLowerCase();
    return cars.filter(car =>
      car.brand.toLowerCase().includes(query) ||
      car.model.toLowerCase().includes(query) ||
      car.trim.toLowerCase().includes(query) ||
      car.displayName.toLowerCase().includes(query) ||
      car.year.toString().includes(query)
    );
  }, [cars, searchQuery]);

  const handleAddCustomAsset = () => {
    if (!selectedCar || !customAssetName.trim() || !onAddCustomAsset) return;

    onAddCustomAsset(selectedCar.id, customAssetName.trim());
    setCustomAssetName('');
    setIsCustomAssetModalOpen(false);
  };

  return (
    <div className="h-full flex flex-col bg-white/5 border border-white/20 rounded-3xl backdrop-blur-sm overflow-hidden">
      {/* Search Bar */}
      <div className="p-6 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search cars..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-all"
          />
        </div>
      </div>

      {/* Car List */}
      <div className="flex-1 overflow-y-auto">
        {/* Standard Assets */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Car className="w-4 h-4" />
            Standard Assets
          </h3>
          <div className="space-y-2">
            {filteredCars.map((car) => (
              <CarItem
                key={car.id}
                car={car}
                isSelected={selectedCar?.id === car.id}
                onSelect={() => onCarSelect(car)}
              />
            ))}
            {filteredCars.length === 0 && searchQuery && (
              <div className="text-center py-8 text-white/40">
                No cars found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Custom Assets */}
        <div className="p-4 border-t border-white/10">
          <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Custom Assets
          </h3>
          {customAssets.length === 0 ? (
            <div className="text-center py-8 text-white/40">
              No custom assets yet
            </div>
          ) : (
            <div className="space-y-2">
              {customAssets.map((asset) => (
                <CustomAssetItem
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedCar?.id === asset.id}
                  onSelect={() => onCarSelect(asset)}
                  onRemove={onRemoveCustomAsset ? () => onRemoveCustomAsset(asset.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Asset Button */}
      {onAddCustomAsset && selectedCar && (
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => setIsCustomAssetModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Asset</span>
          </button>
        </div>
      )}

      {/* Custom Asset Modal */}
      {isCustomAssetModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 border border-white/20 rounded-2xl backdrop-blur-sm p-6 max-w-md w-full">
            <h3 className="text-xl font-medium text-white mb-4">Create Custom Asset</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Based on
                </label>
                <div className="text-white/60 text-sm">
                  {selectedCar && 'brand' in selectedCar
                    ? `${selectedCar.brand} ${selectedCar.model} (${selectedCar.year})`
                    : selectedCar?.name || 'Unknown vehicle'
                  }
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Custom Asset Name
                </label>
                <input
                  type="text"
                  value={customAssetName}
                  onChange={(e) => setCustomAssetName(e.target.value)}
                  placeholder="Enter a name for your custom asset"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customAssetName.trim()) {
                      handleAddCustomAsset();
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsCustomAssetModalOpen(false);
                  setCustomAssetName('');
                }}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-xl text-white/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomAsset}
                disabled={!customAssetName.trim()}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white transition-all"
              >
                Create Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CarItemProps {
  car: CarVariant;
  isSelected: boolean;
  onSelect: () => void;
}

function CarItem({ car, isSelected, onSelect }: CarItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl transition-all ${
        isSelected
          ? 'bg-white/20 border border-white/30'
          : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          isSelected ? 'bg-white' : 'bg-white/40'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {car.displayName}
          </div>
          <div className="text-xs text-white/60">
            {car.referenceImages.length} reference images
          </div>
        </div>
      </div>
    </button>
  );
}

interface CustomAssetItemProps {
  asset: CustomAsset;
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}

function CustomAssetItem({ asset, isSelected, onSelect, onRemove }: CustomAssetItemProps) {
  return (
    <div className={`p-3 rounded-xl transition-all ${
      isSelected
        ? 'bg-white/20 border border-white/30'
        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
    }`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onSelect}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
            isSelected ? 'bg-white' : 'bg-white/40'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {asset.name}
            </div>
            <div className="text-xs text-white/60">
              {asset.adjustments.length} adjustments • {asset.referenceImages.length} images
            </div>
          </div>
        </button>

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 text-white/40 hover:text-red-400 hover:bg-red-500/20 rounded transition-all"
            title="Remove asset"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
