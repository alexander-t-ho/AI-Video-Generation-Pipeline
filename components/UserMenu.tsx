'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { User, Building2, LogOut, Settings, ChevronDown } from 'lucide-react';

export default function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
    );
  }

  if (!session) {
    return (
      <Link
        href="/auth/signin"
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const initials = session.user.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-medium text-white">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <div className="text-sm font-medium text-white">{session.user.name}</div>
          <div className="text-xs text-white/60">{session.user.companyName}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-black/80 rounded-lg shadow-lg border border-white/20 py-1 z-50 backdrop-blur-sm">
          <div className="px-4 py-3 border-b border-white/20">
            <div className="text-sm font-medium text-white">{session.user.name}</div>
            <div className="text-xs text-white/60">{session.user.email}</div>
            <div className="flex items-center mt-2 text-xs text-white/50">
              <Building2 className="w-3 h-3 mr-1" />
              {session.user.companyName}
              {session.user.role === 'ADMIN' && (
                <span className="ml-2 px-1.5 py-0.5 bg-white/10 text-white/80 rounded text-xs">
                  Admin
                </span>
              )}
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              className="flex items-center px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-4 h-4 mr-3" />
              Edit Profile
            </Link>
            <Link
              href="/company"
              className="flex items-center px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Building2 className="w-4 h-4 mr-3" />
              Company
            </Link>
            {session.user.role === 'ADMIN' && (
              <Link
                href="/settings"
                className="flex items-center px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="w-4 h-4 mr-3" />
                Settings
              </Link>
            )}
          </div>

          <div className="border-t border-white/20 py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                signOut({ callbackUrl: '/auth/signin' });
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
