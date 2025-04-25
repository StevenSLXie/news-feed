'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { useRecommendedFeeds } from "./hooks/useRecommendedFeeds";

interface Feed {
  id: string;
  url: string;
  title?: string;
}

interface Article {
  feedId: string;
  feedTitle: string;
  title?: string;
  link?: string;
  published?: string;
  read?: boolean;
  saved?: boolean;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedsCollapsed, setFeedsCollapsed] = useState(true);
  const [tab, setTab] = useState<'all' | 'bySource'>('all');
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);
  const recommendedFeeds = useRecommendedFeeds();
  const [dismissedRecommended, setDismissedRecommended] = useState(false);
  const [hiddenRecommended, setHiddenRecommended] = useState<string[]>([]);

  useEffect(() => {
    fetchFeeds();
    fetchArticles();
  }, []);

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedRecommendedFeeds');
    if (dismissed === 'true') {
      setDismissedRecommended(true);
    }
  }, []);

  useEffect(() => {
    if (dismissedRecommended) {
      localStorage.setItem('dismissedRecommendedFeeds', 'true');
    }
  }, [dismissedRecommended]);

  async function fetchFeeds() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feeds');
      const data = await res.json();
      setFeeds(data);
    } catch {
      setError('Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }

  async function fetchArticles() {
    setError(null);
    setLoadingArticles(true);
    try {
      const res = await fetch('/api/articles');
      const data = await res.json();
      const stateRes = await fetch('/api/article-state-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: data }), credentials: 'include' });
      let stateMap: Record<string, {read: boolean, saved: boolean}> = {};
      if (stateRes.ok) {
        stateMap = await stateRes.json();
      }
      setArticles((prev: Article[]) => {
        const prevLinks = new Set(prev.map(a => a.link));
        const newArticles = data.filter((a: Article) => !prevLinks.has(a.link || ''));
        const updated = [...prev];
        for (const a of newArticles) {
          updated.push({ ...a, ...stateMap[a.link || ''] });
        }
        return updated.map(a => ({ ...a, ...stateMap[a.link || ''] }));
      });
    } catch {
      setError('Failed to load articles');
    } finally {
      setLoadingArticles(false);
    }
  }

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!newFeedUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newFeedUrl }),
        credentials: 'include', // Ensure cookies are sent
      });
      if (!res.ok) throw new Error();
      setNewFeedUrl('');
      await fetchFeeds();
      await fetchArticles();
    } catch {
      setError('Failed to add feed');
    } finally {
      setLoading(false);
    }
  }

  async function removeFeed(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feeds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      await fetchFeeds();
      await fetchArticles();
    } catch {
      setError('Failed to remove feed');
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead(article: Article) {
    await updateArticleState(article, !article.read, article.saved);
  }

  async function toggleSaved(article: Article) {
    await updateArticleState(article, article.read, !article.saved);
  }

  async function updateArticleState(article: Article, read?: boolean, saved?: boolean) {
    try {
      await fetch('/api/article-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: article.link,
          feedId: article.feedId,
          title: article.title,
          published: article.published,
          read,
          saved
        }),
        credentials: 'include',
      });
      fetchArticles();
    } catch {
      // error intentionally ignored
    }
  }

  async function removeArticle(article: Article) {
    try {
      await fetch('/api/remove-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: article.link }),
        credentials: 'include',
      });
      setArticles(prev => prev.filter(a => a.link !== article.link));
    } catch {
      // error intentionally ignored
    }
  }

  if (status === "loading") {
    return <div>Loading authentication...</div>;
  }

  if (!session) {
    return (
      <main className="max-w-xl mx-auto px-3 sm:px-6 py-6 font-sans">
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900">My News Feeds</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <button onClick={() => signIn('google')} className="text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 mr-2" />
            Sign in with Google
          </button>
          <button onClick={() => signIn('github')} className="text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition">
            <img src="https://www.svgrepo.com/show/475656/github.svg" alt="GitHub" className="w-5 h-5 mr-2" />
            Sign in with GitHub
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-3 sm:px-6 py-6 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900">My News Feeds</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>Signed in as {session.user?.email}</span>
          <button onClick={() => signOut()} className="text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition">Sign out</button>
        </div>
      </div>
      <form onSubmit={addFeed} className="flex gap-2 mb-8">
        <input
          type="url"
          placeholder="Add RSS feed URL..."
          value={newFeedUrl}
          onChange={e => setNewFeedUrl(e.target.value)}
          className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 text-base bg-white placeholder-gray-400"
          required
        />
        <button type="submit" className="px-5 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 transition disabled:opacity-60 shadow-sm border border-black/10" disabled={loading}>
          Add
        </button>
      </form>
      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
      {feeds.length === 0 && !dismissedRecommended && (
        <div className="mb-8 p-5 rounded-lg bg-white border border-gray-200 shadow-sm">
          <div className="font-semibold mb-2 text-lg">Recommended Feeds</div>
          <ul className="mb-4">
            {recommendedFeeds.filter(f => !hiddenRecommended.includes(f.url)).map(feed => (
              <li key={feed.url} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                <span className="font-medium text-gray-900">{feed.name}</span>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 rounded bg-black text-white font-medium hover:bg-neutral-800 transition border border-black/10 shadow-sm text-xs"
                    onClick={async () => {
                      setNewFeedUrl(feed.url);
                      await addFeed({ preventDefault: () => {} } as any);
                      setHiddenRecommended(prev => [...prev, feed.url]);
                    }}
                  >Subscribe</button>
                  <button
                    className="px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 font-medium hover:bg-neutral-100 transition text-xs"
                    onClick={() => setHiddenRecommended(prev => [...prev, feed.url])}
                  >Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <button
            className="px-4 py-2 rounded border border-gray-300 bg-white text-gray-600 font-medium hover:bg-neutral-100 transition text-xs"
            onClick={() => setDismissedRecommended(true)}
          >Dismiss All</button>
        </div>
      )}
      <h2 className="mt-8 text-lg font-medium cursor-pointer select-none flex items-center gap-2" onClick={() => setFeedsCollapsed(c => !c)}>
        Subscribed Feeds
        <span className="text-gray-400 text-base">{feedsCollapsed ? '▼' : '▲'}</span>
      </h2>
      {!feedsCollapsed && (
        <ul className="pl-0 list-none mb-8 divide-y divide-gray-100">
          {feeds.map(feed => (
            <li key={feed.id} className="flex items-center py-2">
              <span className="flex-1 truncate text-gray-800">{feed.title ? feed.title : feed.url}</span>
              <button onClick={() => removeFeed(feed.id)} className="ml-2 text-red-500 bg-transparent border-none text-lg hover:bg-red-50 rounded-full w-8 h-8 flex items-center justify-center transition" title="Unsubscribe">×</button>
            </li>
          ))}
          {feeds.length === 0 && <li className="text-gray-400 py-2">No feeds subscribed.</li>}
        </ul>
      )}
      <h2 className="font-semibold text-xl mt-6 mb-2 flex items-center gap-3">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1.5 rounded font-medium text-sm transition border ${tab === 'all' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-neutral-100'}`}
            onClick={() => setTab('all')}
          >
            All
          </button>
          <button
            className={`px-3 py-1.5 rounded font-medium text-sm transition border ${tab === 'bySource' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-neutral-100'}`}
            onClick={() => setTab('bySource')}
          >
            By Source
          </button>
        </div>
        <span className="ml-4">Articles</span>
        <button onClick={fetchArticles} className="ml-2 px-3 py-1.5 rounded border border-black/10 bg-black text-white text-sm font-medium hover:bg-neutral-800 transition shadow-sm">Refresh</button>
      </h2>
      {tab === 'all' && (
        <ul className="list-none p-0">
          {loadingArticles ? (
            <li className="text-gray-400">Loading articles...</li>
          ) : articles.length === 0 ? (
            <li className="text-gray-400">No articles to show.</li>
          ) : (
            articles.map((article, idx) => (
              <li key={idx} className="mb-5 pb-4 border-b border-gray-100 bg-white rounded-lg shadow-sm px-3 py-3 flex flex-col gap-1 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline whitespace-normal break-words">{article.title}</a>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
                </div>
                <div className="flex gap-2 mt-2 sm:mt-0 sm:ml-4">
                  <button onClick={() => toggleRead(article)} className={`text-xs px-3 py-1 rounded border ${article.read ? 'border-green-400 text-green-700 bg-green-50' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-green-100 transition`}>{article.read ? 'Read' : 'Mark as Read'}</button>
                  <button onClick={() => toggleSaved(article)} className={`text-xs px-3 py-1 rounded border ${article.saved ? 'border-black text-white bg-black' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-neutral-800 hover:text-white transition`}>{article.saved ? 'Saved' : 'Save'}</button>
                  <button onClick={() => removeArticle(article)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-500 bg-white hover:bg-red-50 transition">Remove</button>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
      {tab === 'bySource' && (
        <ul className="list-none p-0">
          {feeds.length === 0 ? (
            <li className="text-gray-400">No feeds subscribed.</li>
          ) : (
            feeds.map(feed => {
              const feedArticles = articles.filter(a => a.feedId === feed.id);
              return (
                <li key={feed.id} className="mb-4">
                  <button
                    className="w-full flex justify-between items-center px-4 py-2 rounded bg-white border border-gray-200 shadow-sm text-left font-medium text-gray-900 hover:bg-neutral-50 transition"
                    onClick={() => setExpandedFeedId(expandedFeedId === feed.id ? null : feed.id)}
                  >
                    <span className="truncate">{feed.title || feed.url}</span>
                    <span className="ml-2 text-xs text-gray-400">{expandedFeedId === feed.id ? '▲' : '▼'}</span>
                  </button>
                  {expandedFeedId === feed.id && (
                    <ul className="mt-2 ml-2 border-l border-gray-200 pl-4">
                      {feedArticles.length === 0 ? (
                        <li className="text-gray-400 text-sm">No articles from this source.</li>
                      ) : (
                        feedArticles.map((article, idx) => (
                          <li key={idx} className="mb-3 pb-2 border-b border-gray-50 bg-white rounded px-2 py-2 flex flex-col gap-1">
                            <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline whitespace-normal break-words">{article.title}</a>
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{article.published ? new Date(article.published).toLocaleString() : ''}</div>
                            <div className="flex gap-2 mt-1">
                              <button onClick={() => toggleRead(article)} className={`text-xs px-3 py-1 rounded border ${article.read ? 'border-green-400 text-green-700 bg-green-50' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-green-100 transition`}>{article.read ? 'Read' : 'Mark as Read'}</button>
                              <button onClick={() => toggleSaved(article)} className={`text-xs px-3 py-1 rounded border ${article.saved ? 'border-black text-white bg-black' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-neutral-800 hover:text-white transition`}>{article.saved ? 'Saved' : 'Save'}</button>
                              <button onClick={() => removeArticle(article)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-500 bg-white hover:bg-red-50 transition">Remove</button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </main>
  );
}
