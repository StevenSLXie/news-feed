'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { useRecommendedFeeds } from "./hooks/useRecommendedFeeds";

interface Feed {
  id: string;
  url: string;
  title?: string;
}

interface RecommendedFeed {
  name: string;
  url: string;
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

// Utility to shuffle array
function shuffleArray<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
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
  const [tab, setTab] = useState<'all' | 'bySource' | 'saved'>('all');
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null);
  const recommendedFeeds: RecommendedFeed[] = useRecommendedFeeds();
  const [dismissedRecommended, setDismissedRecommended] = useState(false);
  const [hiddenRecommended, setHiddenRecommended] = useState<string[]>([]);
  const [currentRecs, setCurrentRecs] = useState<RecommendedFeed[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState<Record<string, boolean>>({});
  const [errorSummaries, setErrorSummaries] = useState<Record<string, string | null>>({});
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [errorSaved, setErrorSaved] = useState<string | null>(null);
  // indicator for recent save/unsave actions
  const [justAction, setJustAction] = useState<{ link: string; type: 'saved' | 'removed' } | null>(null);

  // Daily recommendation throttle (client-only)
  const [today, setToday] = useState<string>('');
  const [hasShownToday, setHasShownToday] = useState(false);
  const [showRecommended, setShowRecommended] = useState(false);

  async function handleFetchSummary(link: string) {
    setLoadingSummaries(prev => ({ ...prev, [link]: true }));
    setSummaries(prev => ({ ...prev, [link]: '' }));
    setErrorSummaries(prev => ({ ...prev, [link]: null }));
    let buffer = '';
    let text = '';
    try {
      const res = await fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) });
      if (!res.ok || !res.body) throw new Error('Failed to fetch summary');
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: dr } = await reader.read(); done = dr;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop()!;
          for (const part of parts) {
            const line = part.trim(); if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') { done = true; break; }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) { text += delta; setSummaries(prev => ({ ...prev, [link]: text })); }
            } catch {
              // ignore non-JSON SSE lines
            }
          }
        }
      }
    } catch (err: unknown) {
      setErrorSummaries(prev => ({ ...prev, [link]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoadingSummaries(prev => ({ ...prev, [link]: false }));
    }
  }

  useEffect(() => {
    Promise.all([fetchFeeds(), fetchArticles()]);
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

  useEffect(() => {
    if (tab === 'saved') fetchSavedArticles();
  }, [tab]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const avail = recommendedFeeds.filter(f => !hiddenRecommended.includes(f.url));
    setCurrentRecs(shuffleArray(avail).slice(0, 5));
  }, [recommendedFeeds]);

  // Determine today and check localStorage (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const d = new Date().toISOString().slice(0, 10);
    setToday(d);
    const shown = localStorage.getItem('recommendedShownDate') === d;
    setHasShownToday(shown);
  }, []);

  // Decide to show recommendations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasShownToday && feeds.length < 5) {
      setShowRecommended(true);
      localStorage.setItem('recommendedShownDate', today);
      setHasShownToday(true);
    }
  }, [feeds, hasShownToday, today]);

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
      if (!Array.isArray(data)) {
        setArticles([]);
        setLoadingArticles(false);
        return;
    }
      const stateRes = await fetch('/api/article-state-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: data }),
        credentials: 'include'
      });
      let stateMap: Record<string, { read: boolean, saved: boolean }> = {};
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

  async function fetchSavedArticles() {
    setErrorSaved(null);
    setLoadingSaved(true);
    try {
      const res = await fetch('/api/articles/saved');
      const data = await res.json();
      setSavedArticles(Array.isArray(data) ? data : []);
    } catch {
      setErrorSaved('Failed to load saved articles');
    } finally {
      setLoadingSaved(false);
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

  // Archive: mark as read and remove from list
  async function archiveArticle(article: Article) {
    await updateArticleState(article, true, article.saved);
    setArticles(prev => prev.filter(a => a.link !== article.link));
  }

  async function toggleSaved(article: Article) {
    // Determine current saved status (ensure defined)
    const currentSaved = Boolean(article.saved);
    const newSaved = !currentSaved;
    // Optimistic UI update
    setArticles(prev => prev.map(a => a.link === article.link ? { ...a, saved: newSaved } : a));
    // Persist
    await updateArticleState(article, article.read, newSaved);
    // Update saved list
    if (!newSaved) setSavedArticles(prev => prev.filter(a => a.link !== article.link));
    // Show action indicator
    setJustAction({ link: article.link!, type: newSaved ? 'saved' : 'removed' });
    setTimeout(() => setJustAction(null), 2000);
  }

  async function removeSaved(article: Article) {
    // Unsave on backend
    await updateArticleState(article, article.read, false);
    // Optimistically remove from savedArticles
    setSavedArticles(prev => prev.filter(a => a.link !== article.link));
    // Update main articles state
    setArticles(prev => prev.map(a => a.link === article.link ? { ...a, saved: false } : a));
    // Indicate removal
    setJustAction({ link: article.link!, type: 'removed' });
    setTimeout(() => setJustAction(null), 2000);
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
      // no full refresh here
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
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900">MyDailyNews</h1>
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
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900">MyDailyNews</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>Signed in as {session.user?.email}</span>
          <button onClick={() => signOut()} className="text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-neutral-100 transition">Sign out</button>
        </div>
      </div>
      <form onSubmit={addFeed} className="flex items-center gap-2 mb-8">
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
        <button
          type="button"
          onClick={() => setShowRecommended(prev => !prev)}
          className="px-4 py-2 rounded border border-gray-300 bg-white text-gray-700 hover:bg-neutral-100 transition text-sm"
        >
          {showRecommended ? 'Hide Recommendations' : 'Show Recommendations'}
        </button>
      </form>
      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
      {showRecommended && !dismissedRecommended && (
        <div className="mb-8 p-5 rounded-lg bg-white border border-gray-200 shadow-sm">
          <div className="font-semibold mb-2 text-lg">Recommended Feeds</div>
          <ul className="mb-4">
            {currentRecs.map(feed => (
              <li key={feed.url} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                <span className="font-medium text-gray-900">{feed.name}</span>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 rounded bg-black text-white font-medium hover:bg-neutral-800 transition border border-black/10 shadow-sm text-xs"
                    onClick={async () => {
                      setHiddenRecommended(prev => [...prev, feed.url]);
                      setError(null);
                      setLoading(true);
                      try {
                        const res = await fetch('/api/feeds', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: feed.url }),
                          credentials: 'include',
                        });
                        if (!res.ok) throw new Error();
                        setNewFeedUrl('');
                        await fetchFeeds();
                        await fetchArticles();
                        // remove subscribed feed from current batch
                        setCurrentRecs(prev => prev.filter(f => f.url !== feed.url));
                      } catch {
                        setError('Failed to add feed');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >Subscribe</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded border border-gray-300 bg-white text-gray-600 font-medium hover:bg-neutral-100 transition text-xs"
              onClick={() => setDismissedRecommended(true)}
            >Close</button>
            <button
              className="px-4 py-2 rounded border border-gray-300 bg-white text-gray-600 font-medium hover:bg-neutral-100 transition text-xs"
              onClick={() => {
                const avail = recommendedFeeds.filter(f => !hiddenRecommended.includes(f.url));
                setCurrentRecs(shuffleArray(avail).slice(0, 5));
              }}
            >Switch Batch</button>
          </div>
        </div>
      )}
      {/* Subscribed Feeds */}
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
      <div className="mt-6 mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
        <select
          value={tab}
          onChange={e => setTab(e.target.value as 'all'|'bySource'|'saved')}
          className="px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 text-sm focus:ring-2 focus:ring-neutral-400"
        >
          <option value="all">All</option>
          <option value="bySource">By Source</option>
          <option value="saved">Saved</option>
        </select>
        <button
          onClick={fetchArticles}
          className="px-3 py-1.5 rounded border border-black/10 bg-black text-white text-sm font-medium hover:bg-neutral-800 transition shadow-sm"
        >Refresh</button>
      </div>
      {tab === 'all' && (
        <ul className="list-none p-0">
          {loadingArticles ? (
            <li className="text-gray-400">Loading articles...</li>
          ) : articles.length === 0 ? (
            <li className="text-gray-400">No articles to show.</li>
          ) : (
            articles.map((article, idx) => {
              return (
                <li key={idx} className="mb-5 pb-4 border-b border-gray-100 bg-white rounded-lg shadow-sm px-3 py-3 flex flex-col gap-2">
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline break-words">{article.title}</a>
                  <div className="text-xs text-gray-500">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
                  <div className="flex items-center gap-2 mt-2 relative">
                    <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="Archive">✅</button>
                    <button onClick={() => toggleSaved(article)} title={article.saved ? 'Unsave' : 'Save'} className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label={article.saved ? 'Unsave' : 'Save'}>🔖</button>
                    {justAction?.link === article.link && justAction?.type === 'saved' && <span className="text-green-500 ml-1 text-xs">Saved!</span>}
                    {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                    <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="AI Summary" disabled={!article.link}>💡</button>
                  </div>
                  {loadingSummaries[article.link!] && <span>Loading summary...</span>}
                  {summaries[article.link!] && <div className="mt-2 break-words whitespace-normal">{summaries[article.link!]}</div>}
                  {errorSummaries[article.link!] && <div className="mt-2 text-red-500">{errorSummaries[article.link!]}</div>}
                </li>
              );
            })
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
                          <li key={idx} className="mb-3 pb-2 border-b border-gray-50 bg-white rounded px-2 py-2 flex flex-col gap-2">
                            <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline break-words">{article.title}</a>
                            <div className="text-xs text-gray-500">{article.published ? new Date(article.published).toLocaleString() : ''}</div>
                            <div className="flex items-center gap-2 mt-1 relative">
                              <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="Archive">✅</button>
                              <button onClick={() => toggleSaved(article)} title={article.saved ? 'Unsave' : 'Save'} className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label={article.saved ? 'Unsave' : 'Save'}>🔖</button>
                              {justAction?.link === article.link && justAction?.type === 'saved' && <span className="text-green-500 ml-1 text-xs">Saved!</span>}
                              {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                              <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="AI Summary" disabled={!article.link}>💡</button>
                            </div>
                            {loadingSummaries[article.link!] && <span>Loading summary...</span>}
                            {summaries[article.link!] && <div className="w-full mt-2 break-words whitespace-normal">{summaries[article.link!]}</div>}
                            {errorSummaries[article.link!] && <div className="w-full mt-2 text-red-500">{errorSummaries[article.link!]}</div>}
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
      {tab === 'saved' && (
        <ul className="list-none p-0">
          {loadingSaved ? (
            <li className="text-gray-400">Loading saved articles...</li>
          ) : errorSaved ? (
            <li className="text-red-500">{errorSaved}</li>
          ) : savedArticles.length === 0 ? (
            <li className="text-gray-400">No saved articles.</li>
          ) : (
            savedArticles.map((article, idx) => (
              <li key={idx} className="mb-5 pb-4 border-b border-gray-100 bg-white rounded-lg shadow-sm px-3 py-3 flex flex-col gap-2">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline break-words">{article.title}</a>
                <div className="text-xs text-gray-500">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="Archive">✅</button>
                  <button onClick={() => removeSaved(article)} title="Remove" className="p-1 text-red-500 hover:text-red-700 transition" aria-label="Remove">🗑️</button>
                  {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                  <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="p-1 text-gray-500 hover:text-gray-700 transition" aria-label="AI Summary" disabled={!article.link}>💡</button>
                </div>
                {loadingSummaries[article.link!] && <span>Loading summary...</span>}
                {summaries[article.link!] && <div className="mt-2 break-words whitespace-normal">{summaries[article.link!]}</div>}
                {errorSummaries[article.link!] && <div className="mt-2 text-red-500">{errorSummaries[article.link!]}</div>}
              </li>
            ))
          )}
        </ul>
      )}
    </main>
  );
}
