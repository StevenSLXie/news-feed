'use client';

import React from 'react';
import { signOut } from 'next-auth/react';

interface HeaderProps {
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
}

export default function Header({ theme, setTheme }: HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="MyDailyNews logo" className="h-8 w-8" />
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900 dark:text-gray-100">
          MyDailyNews
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {/* removed user email display */}
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