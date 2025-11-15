'use client';

import { useEffect } from 'react';

/**
 * Global error handler to suppress harmless browser extension errors
 */
export default function ErrorHandler() {
  useEffect(() => {
    // Suppress harmless browser extension errors
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';
      const errorString = String(errorMessage).toLowerCase();
      
      // Suppress browser extension message channel errors
      if (
        errorString.includes('message channel closed') ||
        errorString.includes('asynchronous response') ||
        errorString.includes('listener indicated') ||
        errorString.includes('a listener indicated an asynchronous response') ||
        errorString.includes('message channel closed before a response was received')
      ) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    // Suppress unhandled promise rejections from browser extensions
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMessage = event.reason?.message || String(event.reason || '');
      const errorString = String(errorMessage).toLowerCase();
      
      // Suppress browser extension message channel errors
      if (
        errorString.includes('message channel closed') ||
        errorString.includes('asynchronous response') ||
        errorString.includes('listener indicated') ||
        errorString.includes('a listener indicated an asynchronous response') ||
        errorString.includes('message channel closed before a response was received')
      ) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    // Also override console.error to suppress these errors in console
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const errorString = args.map(arg => String(arg)).join(' ').toLowerCase();
      
      // Suppress browser extension errors in console
      if (
        errorString.includes('message channel closed') ||
        errorString.includes('asynchronous response') ||
        errorString.includes('listener indicated') ||
        errorString.includes('a listener indicated an asynchronous response')
      ) {
        // Silently ignore - don't log to console
        return;
      }
      
      // Call original console.error for other errors
      originalConsoleError.apply(console, args);
    };

    window.addEventListener('error', handleError, true); // Use capture phase
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true); // Use capture phase

    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
      // Restore original console.error
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}

