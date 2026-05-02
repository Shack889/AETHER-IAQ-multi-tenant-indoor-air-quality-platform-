'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Suspense } from 'react';

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get('error');

  const errorMessages: Record<string, string> = {
    OAuthSignin:    'Error occurred during sign-in. Please try again.',
    OAuthCallback:  'Error occurred during OAuth callback.',
    OAuthCreateAccount: 'Could not create account.',
    AccessDenied:   'Access was denied.',
    Verification:   'Token has expired or already been used.',
    Default:        'An unexpected authentication error occurred.',
  };

  const message = error ? (errorMessages[error] ?? errorMessages['Default']) : errorMessages['Default'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0" data-theme="dark"
         style={{ background: '#0f1117' }}>
      <div className="text-center max-w-sm mx-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Authentication Error</h1>
        <p className="text-slate-400 text-sm mb-6">{message}</p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-aether-600 text-white font-medium text-sm hover:bg-aether-500 transition-colors"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900" />}>
      <ErrorContent />
    </Suspense>
  );
}
