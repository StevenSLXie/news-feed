'use client';

import React from 'react';
import { signOut } from 'next-auth/react';

interface HeaderProps {
  sessionEmail?: string | null | undefined;
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
}

export default function Header({ sessionEmail, theme, setTheme }: HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <img src="/logo.svg" alt="MyDailyNews logo" className="h-8 w-8" />
      <div className="w-full sm:w-auto text-sm text-gray-600 dark:text-gray-300 flex items-center gap-3">
        <span>Signed in as {sessionEmail}</span>
        <button
          onClick={() => signOut()}
          className="text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-gray-600 transition"
        >
          Sign out
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 hover:bg-neutral-100 dark:hover:bg-gray-600 transition"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </div>
  );
}