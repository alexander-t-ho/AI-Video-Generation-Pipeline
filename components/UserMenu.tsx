'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Building2, LogOut, Settings, ChevronDown, Mail, Lock } from 'lucide-react';

interface UserMenuProps {
  showFullButton?: boolean;
}

export default function UserMenu({ showFullButton = false }: UserMenuProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsLoginOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        setIsLoginOpen(false);
        setEmail('');
        setPassword('');
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
    );
  }

  if (!session) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsLoginOpen(!isLoginOpen)}
          className={`${
            showFullButton
              ? 'px-6 py-2.5 text-base font-semibold text-white bg-white/20 hover:bg-white/30 rounded-xl'
              : 'px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg'
          } transition-colors border border-white/20 backdrop-blur-sm`}
        >
          Sign In
        </button>

        {isLoginOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-black/90 rounded-lg shadow-lg border border-white/20 py-4 px-5 z-50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Sign In</h3>
            
            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 transition-all"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 transition-all"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-white text-black rounded-lg font-medium hover:bg-white/90 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-sm text-white/60 text-center">
                Don't have an account?{' '}
                <Link
                  href="/auth/signup"
                  className="text-white hover:text-white/80 underline"
                  onClick={() => setIsLoginOpen(false)}
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
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
                signOut({ callbackUrl: '/' });
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
