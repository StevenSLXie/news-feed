'use client';

import React from 'react';

interface FeedFormProps {
  newFeedUrl: string;
  loading: boolean;
  showRecommended: boolean;
  onUrlChange: (url: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onToggleRecommended: () => void;
  onResetRecommended: () => void;
}

export default function FeedForm({
  newFeedUrl,
  loading,
  showRecommended,
  onUrlChange,
  onSubmit,
  onToggleRecommended,
  onResetRecommended,
}: FeedFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-8">
      <input
        type="url"
        placeholder="Add RSS feed URL..."
        value={newFeedUrl}
        onChange={e => onUrlChange(e.target.value)}
        className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 text-base bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-600"
        required
      />
      <button
        type="submit"
        className="w-full sm:w-auto px-5 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 transition disabled:opacity-60 shadow-sm border border-black/10 text-center"
        disabled={loading}
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          onResetRecommended();
          onToggleRecommended();
        }}
        className="w-full sm:w-auto px-4 py-2 rounded border border-gray-300 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-neutral-100 dark:hover:bg-gray-700 transition text-sm text-center"
      >
        {showRecommended ? 'Hide Recommendations' : 'Show Recommendations'}
      </button>
    </form>
  );
}
