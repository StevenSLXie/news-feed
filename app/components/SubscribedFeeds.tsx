'use client';

import React from 'react';

interface Feed {
  id: string;
  url: string;
  title?: string;
}

interface SubscribedFeedsProps {
  feeds: Feed[];
  feedsCollapsed: boolean;
  onToggle: () => void;
  removeFeed: (id: string) => void;
}

export default function SubscribedFeeds({ feeds, feedsCollapsed, onToggle, removeFeed }: SubscribedFeedsProps) {
  return (
    <>
      <h2
        className="mt-8 text-lg font-medium cursor-pointer select-none flex items-center gap-2"
        onClick={onToggle}
      >
        Subscribed Feeds
        <span className="text-gray-400 dark:text-gray-600 text-base">
          {feedsCollapsed ? '▼' : '▲'}
        </span>
      </h2>
      {!feedsCollapsed && (
        <ul className="mt-2">
          {feeds.map(feed => (
            <li key={feed.id} className="flex items-center py-2">
              <span className="flex-1 truncate text-gray-800 dark:text-gray-200">
                {feed.title || feed.url}
              </span>
              <button
                onClick={() => removeFeed(feed.id)}
                className="ml-2 text-red-500 bg-transparent border-none text-lg hover:bg-red-50 dark:hover:bg-red-900 rounded-full w-8 h-8 flex items-center justify-center transition"
                title="Unsubscribe"
              >
                ×
              </button>
            </li>
          ))}
          {feeds.length === 0 && (
            <li className="text-gray-400 dark:text-gray-600 py-2">
              No feeds subscribed.
            </li>
          )}
        </ul>
      )}
    </>
  );
}
