'use client';

import React from 'react';
import { signIn } from 'next-auth/react';

interface LoginPromptProps {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  emailLogin: string;
  setEmailLogin: React.Dispatch<React.SetStateAction<string>>;
}

export default function LoginPrompt({ status, emailLogin, setEmailLogin }: LoginPromptProps) {
  if (status === 'loading') {
    return <div>Loading authentication...</div>;
  }

  return (
    <main className="max-w-xl mx-auto px-3 sm:px-6 py-6 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <h1 className="font-semibold text-2xl tracking-tight text-gray-900 mb-4">MyDailyNews</h1>
      <div className="text-sm flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <button onClick={() => signIn('google')} className="w-full sm:w-auto text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition flex items-center justify-center">
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 mr-2" />
          Sign in with Google
        </button>
        <button onClick={() => signIn('github')} className="w-full sm:w-auto text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition flex items-center justify-center">
          <img src="https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/github.svg" alt="GitHub" className="w-5 h-5 mr-2" />
          Sign in with GitHub
        </button>
      </div>
      <div className="border-t border-gray-300 my-4" />
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <input
          type="email"
          placeholder="you@example.com"
          value={emailLogin}
          onChange={e => setEmailLogin(e.target.value)}
          className="flex-1 px-3 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-neutral-400 text-base"
        />
        <button
          type="button"
          onClick={() => signIn('email', { email: emailLogin })}
          disabled={!emailLogin}
          className="w-full sm:w-auto px-5 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 transition disabled:opacity-60 text-center"
        >
          Send Magic Link
        </button>
      </div>
    </main>
  );
}
