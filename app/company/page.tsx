'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Trash2, Loader2, Building2, Car, Image as ImageIcon, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Logo {
  id: string;
  s3Key: string;
  filename: string;
  url: string;
}

export default function CompanyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [logos, setLogos] = useState<Logo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCompanyData = useCallback(async () => {
    try {
      const res = await fetch('/api/company');
      if (res.ok) {
        const data = await res.json();
        setCompanyName(data.name || '');
        setLogos(data.logos || []);
      }
    } catch (error) {
      console.error('Failed to fetch company data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchCompanyData();
    }
  }, [status, router, fetchCompanyData]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/company/logo', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const newLogo = await res.json();
        setLogos((prev) => [...prev, newLogo]);
        setMessage({ type: 'success', text: 'Logo uploaded successfully' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to upload logo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred during upload' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteLogo = async (logoId: string) => {
    try {
      const res = await fetch(`/api/company/logo/${logoId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setLogos((prev) => prev.filter((logo) => logo.id !== logoId));
        setMessage({ type: 'success', text: 'Logo deleted successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to delete logo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    }
  };

  const handleSaveCompanyName = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Company name updated successfully' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to update company name' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An error occurred' });
    } finally {
      setIsSaving(false);
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
    <div className="min-h-screen cinematic-gradient text-white p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center text-white/60 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-8 h-8 text-white/80" />
          <h1 className="text-4xl font-bold">Company Settings</h1>
        </div>
        <p className="text-white/60 mb-8 ml-11">Manage your company information and assets</p>

        {message && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-300 border border-green-500/30'
                : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Company Name */}
        <div className="mb-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          <label htmlFor="companyName" className="block text-sm font-medium text-white/80 mb-3">
            Company Name
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 transition-all"
            />
            <button
              onClick={handleSaveCompanyName}
              disabled={isSaving}
              className="px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>

        {/* Company Logos */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm mb-8">
          <h2 className="text-xl font-semibold mb-2 text-white">Company Logos</h2>
          <p className="text-white/60 mb-6">Upload your company logos for use in video generation.</p>

          {/* Upload Button */}
          <label className="flex items-center justify-center gap-2 w-full p-6 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-white/40 transition-colors mb-6">
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-white/60" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-white/60" />
                <span className="text-white/60">Click to upload a logo</span>
              </>
            )}
          </label>

          {/* Logo Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {logos.map((logo) => (
              <div
                key={logo.id}
                className="relative group bg-white/10 rounded-lg p-4 border border-white/20"
              >
                <img
                  src={logo.url}
                  alt={logo.filename}
                  className="w-full h-32 object-contain"
                />
                <p className="text-xs text-white/60 mt-2 truncate">{logo.filename}</p>
                <button
                  onClick={() => handleDeleteLogo(logo.id)}
                  className="absolute top-2 right-2 p-2 bg-red-600/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {logos.length === 0 && (
            <p className="text-center text-white/40 py-8">No logos uploaded yet</p>
          )}
        </div>

        {/* Asset Management Links */}
        <div>
          <h2 className="text-2xl font-semibold mb-2 text-white">Asset Management</h2>
          <p className="text-white/60 mb-6">Manage your company's car models and media assets for video generation.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Car Models & Media */}
            <Link
              href="/company/cars"
              className="group p-6 bg-white/5 border border-white/20 rounded-lg hover:border-white/40 hover:bg-white/10 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Car className="w-6 h-6 text-blue-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-white">Car Models & Media</h3>
              <p className="text-sm text-white/60">
                Upload and manage car models, variants, exterior/interior images, and 3D models
              </p>
            </Link>

            {/* Company Images */}
            <Link
              href="/company/assets"
              className="group p-6 bg-white/5 border border-white/20 rounded-lg hover:border-white/40 hover:bg-white/10 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <ImageIcon className="w-6 h-6 text-purple-400" />
                </div>
                <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-white">Brand Assets & Images</h3>
              <p className="text-sm text-white/60">
                Upload custom images and brand assets to use in your video projects
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
