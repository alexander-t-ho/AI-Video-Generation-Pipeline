'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

interface Asset {
  id: string;
  type: string;
  filename: string;
  url: string;
  createdAt: string;
}

export default function AssetsManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchAssets();
    }
  }, [status, router]);

  const fetchAssets = async () => {
    try {
      const res = await fetch('/api/company/assets');
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/company/assets', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const newAsset = await res.json();
        setAssets((prev) => [newAsset, ...prev]);
        setMessage({ type: 'success', text: 'Asset uploaded successfully' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to upload asset' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred during upload' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;

    try {
      const res = await fetch(`/api/company/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
        setMessage({ type: 'success', text: 'Asset deleted successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete asset' });
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
        <Link
          href="/company"
          className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Company Settings
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <ImageIcon className="w-8 h-8 text-purple-500" />
          <h1 className="text-3xl font-bold">Brand Assets & Images</h1>
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

        {/* Upload Section */}
        <div className="mb-8">
          <label className="flex items-center justify-center gap-2 w-full p-8 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-gray-500 transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400" />
                <div className="text-center">
                  <p className="text-gray-400">Click to upload brand assets and images</p>
                  <p className="text-sm text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                </div>
              </>
            )}
          </label>
        </div>

        {/* Assets Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="relative group bg-gray-900 rounded-lg p-4 border border-gray-700"
            >
              <img
                src={`${asset.url}&thumb=medium`}
                alt={asset.filename}
                className="w-full h-40 object-cover rounded mb-2"
              />
              <p className="text-xs text-gray-400 truncate">{asset.filename}</p>
              <p className="text-xs text-gray-600 mt-1">
                {new Date(asset.createdAt).toLocaleDateString()}
              </p>
              <button
                onClick={() => handleDelete(asset.id)}
                className="absolute top-2 right-2 p-2 bg-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {assets.length === 0 && (
          <div className="text-center py-16">
            <ImageIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">No assets uploaded yet. Upload images to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
