'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Loader2, Car, Upload, X } from 'lucide-react';
import Link from 'next/link';

interface CarModel {
  id: string;
  name: string;
  variants: CarVariant[];
}

interface CarVariant {
  id: string;
  year: number;
  trim: string;
  media: CarMedia[];
}

interface CarMedia {
  id: string;
  type: 'EXTERIOR' | 'INTERIOR' | 'SOUND' | 'THREE_D_MODEL';
  filename: string;
  url: string;
}

export default function CarsManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [cars, setCars] = useState<CarModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create car modal state
  const [showCreateCarModal, setShowCreateCarModal] = useState(false);
  const [newCarName, setNewCarName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Create variant modal state
  const [showCreateVariantModal, setShowCreateVariantModal] = useState(false);
  const [selectedCarForVariant, setSelectedCarForVariant] = useState<string | null>(null);
  const [newVariantYear, setNewVariantYear] = useState('');
  const [newVariantTrim, setNewVariantTrim] = useState('');

  // Upload media modal state
  const [showUploadMediaModal, setShowUploadMediaModal] = useState(false);
  const [selectedVariantForMedia, setSelectedVariantForMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'EXTERIOR' | 'INTERIOR' | 'SOUND' | 'THREE_D_MODEL'>('EXTERIOR');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchCars();
    }
  }, [status, router]);

  const fetchCars = async () => {
    try {
      const res = await fetch('/api/company/cars');
      if (res.ok) {
        const data = await res.json();
        setCars(data.cars || []);
      }
    } catch (error) {
      console.error('Failed to fetch cars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCar = async () => {
    if (!newCarName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/company/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCarName }),
      });

      if (res.ok) {
        const newCar = await res.json();
        setCars((prev) => [...prev, newCar]);
        setMessage({ type: 'success', text: 'Car model created successfully' });
        setShowCreateCarModal(false);
        setNewCarName('');
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to create car model' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCar = async (carId: string) => {
    if (!confirm('Are you sure you want to delete this car model? This will delete all variants and media.')) return;

    try {
      const res = await fetch(`/api/company/cars/${carId}`, { method: 'DELETE' });
      if (res.ok) {
        setCars((prev) => prev.filter((car) => car.id !== carId));
        setMessage({ type: 'success', text: 'Car model deleted successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete car model' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const handleCreateVariant = async () => {
    if (!selectedCarForVariant || !newVariantYear || !newVariantTrim.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch(`/api/company/cars/${selectedCarForVariant}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: parseInt(newVariantYear), trim: newVariantTrim }),
      });

      if (res.ok) {
        await fetchCars();
        setMessage({ type: 'success', text: 'Variant created successfully' });
        setShowCreateVariantModal(false);
        setSelectedCarForVariant(null);
        setNewVariantYear('');
        setNewVariantTrim('');
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to create variant' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVariantForMedia) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', mediaType);

    try {
      const res = await fetch(`/api/company/cars/variants/${selectedVariantForMedia}/media`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await fetchCars();
        setMessage({ type: 'success', text: 'Media uploaded successfully' });
        setShowUploadMediaModal(false);
        setSelectedVariantForMedia(null);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to upload media' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    try {
      const res = await fetch(`/api/company/cars/media/${mediaId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCars();
        setMessage({ type: 'success', text: 'Media deleted successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete media' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <Link href="/company" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Company Settings
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Car className="w-8 h-8 text-blue-500" />
            <h1 className="text-3xl font-bold">Car Models & Media</h1>
          </div>
          <button
            onClick={() => setShowCreateCarModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Car Model
          </button>
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              message.type === 'success'
                ? 'bg-green-900/50 text-green-300 border border-green-700'
                : 'bg-red-900/50 text-red-300 border border-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Car Models List */}
        <div className="space-y-6">
          {cars.map((car) => (
            <div key={car.id} className="bg-gray-900 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{car.name}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedCarForVariant(car.id);
                      setShowCreateVariantModal(true);
                    }}
                    className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                  >
                    Add Variant
                  </button>
                  <button
                    onClick={() => handleDeleteCar(car.id)}
                    className="p-2 text-red-400 hover:bg-red-900/20 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Variants */}
              <div className="space-y-4">
                {car.variants.length === 0 ? (
                  <p className="text-gray-500 text-sm">No variants yet</p>
                ) : (
                  car.variants.map((variant) => (
                    <div key={variant.id} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">
                          {variant.year} - {variant.trim}
                        </h3>
                        <button
                          onClick={() => {
                            setSelectedVariantForMedia(variant.id);
                            setShowUploadMediaModal(true);
                          }}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                        >
                          Upload Media
                        </button>
                      </div>

                      {/* Media Grid */}
                      {variant.media.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {variant.media.map((media) => (
                            <div key={media.id} className="relative group bg-gray-700 rounded p-2">
                              <img
                                src={`${media.url}&thumb=small`}
                                alt={media.filename}
                                className="w-full h-24 object-cover rounded"
                              />
                              <p className="text-xs text-gray-400 mt-1 truncate">{media.type}</p>
                              <button
                                onClick={() => handleDeleteMedia(media.id)}
                                className="absolute top-1 right-1 p-1 bg-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {cars.length === 0 && (
            <div className="text-center py-12">
              <Car className="w-16 h-16 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">No car models yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Car Modal */}
      {showCreateCarModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Create Car Model</h2>
              <button onClick={() => setShowCreateCarModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={newCarName}
              onChange={(e) => setNewCarName(e.target.value)}
              placeholder="e.g., Porsche 911"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg mb-4"
            />
            <button
              onClick={handleCreateCar}
              disabled={isCreating || !newCarName.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Create Variant Modal */}
      {showCreateVariantModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Create Variant</h2>
              <button onClick={() => setShowCreateVariantModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="number"
              value={newVariantYear}
              onChange={(e) => setNewVariantYear(e.target.value)}
              placeholder="Year (e.g., 2024)"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg mb-3"
            />
            <input
              type="text"
              value={newVariantTrim}
              onChange={(e) => setNewVariantTrim(e.target.value)}
              placeholder="Trim (e.g., GT3)"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg mb-4"
            />
            <button
              onClick={handleCreateVariant}
              disabled={isCreating || !newVariantYear || !newVariantTrim.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Upload Media Modal */}
      {showUploadMediaModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Upload Media</h2>
              <button onClick={() => setShowUploadMediaModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as any)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg mb-4"
            >
              <option value="EXTERIOR">Exterior</option>
              <option value="INTERIOR">Interior</option>
              <option value="SOUND">Sound</option>
              <option value="THREE_D_MODEL">3D Model</option>
            </select>
            <label className="flex items-center justify-center gap-2 w-full p-6 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-gray-500">
              <input
                type="file"
                accept="image/*,audio/*,.glb,.gltf"
                onChange={handleUploadMedia}
                className="hidden"
                disabled={isUploading}
              />
              {isUploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Upload className="w-6 h-6" />
                  <span>Click to upload</span>
                </>
              )}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
