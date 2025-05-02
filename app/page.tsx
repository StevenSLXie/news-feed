'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { useRecommendedFeeds } from "./hooks/useRecommendedFeeds";
import Header from './components/Header';


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
  const [theme, setTheme] = useState<'light'|'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
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
  const [showRecommended, setShowRecommended] = useState(false);

  // Email login
  const [emailLogin, setEmailLogin] = useState('');

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
    fetchFeeds();
    loadPage(1);
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

  useEffect(() => {
    const avail = recommendedFeeds.filter(f => !hiddenRecommended.includes(f.url));
    setCurrentRecs(shuffleArray(avail).slice(0, 5));
  }, [recommendedFeeds, hiddenRecommended]);

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

  // Infinite scroll
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  async function loadPage(pageNumber = 1) {
    console.log('loadPage called for page', pageNumber);
    setError(null);
    if (pageNumber === 1) {
      setLoadingArticles(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch(`/api/articles?page=${pageNumber}&pageSize=30`);
      const data = await res.json(); if (!Array.isArray(data)) throw new Error();
      const stateRes = await fetch('/api/article-state-bulk', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({articles:data}), credentials: 'include' });
      const stateMap = stateRes.ok ? await stateRes.json() : {};
      const enriched = data.map((a: Article) => ({ ...a, ...stateMap[a.link||''] }));
      setArticles(prev => pageNumber===1 ? enriched : [...prev, ...enriched]);
      setHasMore(data.length === 30);
    } catch {
      setError('Failed to load articles');
    } finally {
      if (pageNumber === 1) {
        setLoadingArticles(false);
      } else {
        setLoadingMore(false);
      }
    }
  }
  useEffect(() => {
    console.log('Infinite scroll useEffect: loadingMore, hasMore', loadingMore, hasMore);
    const el = loaderRef.current;
    console.log('Sentinel ref element:', el);
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      console.log('IO callback entries:', entries, 'scrollHeight:', document.body.scrollHeight, 'innerHeight:', window.innerHeight);
      entries.forEach(entry => {
        console.log('Entry isIntersecting:', entry.isIntersecting);
        if (entry.isIntersecting) {
          console.log('IO: loading next page', page + 1);
          setPage(p => p + 1);
        }
      });
    }, { rootMargin: '0px', threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadingMore, hasMore]);

  useEffect(() => { if (page>1) loadPage(page); }, [page]);

  useEffect(() => {
    function handleScroll() {
      if (loadingMore || !hasMore) return;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 100) {
        console.log('Scroll near bottom: scheduling page', page + 1);
        setPage(p => p + 1);
      }
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMore, page]);

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
      await loadPage(1);
      // remove subscribed feed from current batch
      setCurrentRecs(prev => prev.filter(f => f.url !== newFeedUrl));
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
      await loadPage(1);
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
      <main className="max-w-xl mx-auto px-3 sm:px-6 py-6 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <h1 className="font-semibold text-2xl tracking-tight text-gray-900">MyDailyNews</h1>
        <div className="mt-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={() => signIn('google')} className="w-full sm:w-auto text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition flex items-center justify-center">
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 mr-2" />
            Sign in with Google
          </button>
          <button onClick={() => signIn('github')} className="w-full sm:w-auto text-gray-700 bg-gray-100 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-200 transition flex items-center justify-center">
            <img src="https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/github.svg" alt="GitHub" className="w-5 h-5 mr-2" />
            Sign in with GitHub
          </button>
        </div>
        {/* Separator between OAuth and email login */}
        <div className="my-4 border-t border-gray-300" />
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
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
            className="w-full sm:w-auto px-5 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 transition disabled:opacity-60 text-center"
            disabled={!emailLogin}
          >
            Send Magic Link
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-3 sm:px-6 py-6 font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header sessionEmail={session.user?.email} theme={theme} setTheme={setTheme} />
      <form onSubmit={addFeed} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-8">
        <input
          type="url"
          placeholder="Add RSS feed URL..."
          value={newFeedUrl}
          onChange={e => setNewFeedUrl(e.target.value)}
          className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 text-base bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-600"
          required
        />
        <button type="submit" className="w-full sm:w-auto px-5 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 transition disabled:opacity-60 shadow-sm border border-black/10 text-center" disabled={loading}>
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissedRecommended(false);
            setShowRecommended(prev => !prev);
          }}
          className="w-full sm:w-auto px-4 py-2 rounded border border-gray-300 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-neutral-100 dark:hover:bg-gray-700 transition text-sm text-center"
        >
          {showRecommended ? 'Hide Recommendations' : 'Show Recommendations'}
        </button>
      </form>
      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
      {showRecommended && !dismissedRecommended && (
        <div className="mb-8 p-5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="font-semibold mb-2 text-lg">Recommended Feeds</div>
          <ul className="mb-4">
            {currentRecs.map(feed => (
              <li key={feed.url} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-b-0">
                <span className="font-medium text-gray-900 dark:text-gray-200">{feed.name}</span>
                <div className="flex gap-2">
                  {feeds.some(f => f.url === feed.url) ? (
                    <button disabled className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs">
                      ✓ Subscribed
                    </button>
                  ) : (
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
                          await loadPage(1);
                          // remove subscribed feed from current batch
                          setCurrentRecs(prev => prev.filter(f => f.url !== feed.url));
                        } catch {
                          setError('Failed to add feed');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >Subscribe</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded border border-gray-300 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium hover:bg-neutral-100 dark:hover:bg-gray-700 transition text-xs"
              onClick={() => setDismissedRecommended(true)}
            >Close</button>
            <button
              className="px-4 py-2 rounded border border-gray-300 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium hover:bg-neutral-100 dark:hover:bg-gray-700 transition text-xs"
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
        <span className="text-gray-400 dark:text-gray-600 text-base">{feedsCollapsed ? '▼' : '▲'}</span>
      </h2>
      {!feedsCollapsed && (
        <ul className="pl-0 list-none mb-8 divide-y divide-gray-100 dark:divide-gray-700">
          {feeds.map(feed => (
            <li key={feed.id} className="flex items-center py-2">
              <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{feed.title ? feed.title : feed.url}</span>
              <button onClick={() => removeFeed(feed.id)} className="ml-2 text-red-500 bg-transparent border-none text-lg hover:bg-red-50 dark:hover:bg-red-900 rounded-full w-8 h-8 flex items-center justify-center transition" title="Unsubscribe">×</button>
            </li>
          ))}
          {feeds.length === 0 && <li className="text-gray-400 dark:text-gray-600 py-2">No feeds subscribed.</li>}
        </ul>
      )}
      <div className="mt-6 mb-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <select
          value={tab}
          onChange={e => setTab(e.target.value as 'all'|'bySource'|'saved')}
          className="w-full sm:w-auto px-3 py-1.5 rounded border border-gray-300 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm focus:ring-2 focus:ring-neutral-400"
        >
          <option value="all">All</option>
          <option value="bySource">By Source</option>
          <option value="saved">Saved</option>
        </select>
        <button
          onClick={() => loadPage(1)}
          className="w-full sm:w-auto px-3 py-1.5 rounded border border-black/10 bg-black text-white text-sm font-medium hover:bg-neutral-800 transition shadow-sm text-center"
        >Refresh</button>
      </div>
      {tab === 'all' && (
        <ul className="list-none p-0">
          {loadingArticles ? (
            <li className="text-gray-400 dark:text-gray-600">Loading articles...</li>
          ) : articles.length === 0 ? (
            <li className="text-gray-400 dark:text-gray-600">No articles to show.</li>
          ) : (
            articles.map((article, idx) => {
              return (
                <li key={idx} className="mb-5 pb-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg shadow-sm px-3 py-3 flex flex-col gap-2">
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 dark:text-blue-400 hover:underline break-words">{article.title}</a>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
                  <div className="flex items-center gap-2 mt-2 relative">
                    <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition" aria-label="Archive">✅</button>
                    <button onClick={() => toggleSaved(article)} title={article.saved ? 'Unsave' : 'Save'} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition" aria-label={article.saved ? 'Unsave' : 'Save'}>🔖</button>
                    {justAction?.link === article.link && justAction?.type === 'saved' && <span className="text-green-500 ml-1 text-xs">Saved!</span>}
                    {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                    <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1" aria-label="AI Summary" disabled={!article.link}>💡 AI Summary</button>
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
      {tab === 'all' && (
        <>
          <div ref={loaderRef} className="h-10 w-full"></div>
          {loadingMore && <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading more...</div>}
        </>
      )}
      {tab === 'bySource' && (
        <ul className="list-none p-0">
          {feeds.length === 0 ? (
            <li className="text-gray-400 dark:text-gray-600">No feeds subscribed.</li>
          ) : (
            feeds.map(feed => {
              const feedArticles = articles.filter(a => a.feedId === feed.id);
              return (
                <li key={feed.id} className="mb-4">
                  <button
                    className="w-full flex justify-between items-center px-4 py-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-left font-medium text-gray-900 dark:text-gray-200 hover:bg-neutral-50 dark:hover:bg-gray-700 transition"
                    onClick={() => setExpandedFeedId(expandedFeedId === feed.id ? null : feed.id)}
                  >
                    <span className="truncate">{feed.title || feed.url}</span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-600">{expandedFeedId === feed.id ? '▲' : '▼'}</span>
                  </button>
                  {expandedFeedId === feed.id && (
                    <ul className="mt-2 ml-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                      {feedArticles.length === 0 ? (
                        <li className="text-gray-400 dark:text-gray-600 text-sm">No articles from this source.</li>
                      ) : (
                        feedArticles.map((article, idx) => (
                          <li key={idx} className="mb-3 pb-2 border-b border-gray-50 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-2 flex flex-col gap-2">
                            <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 dark:text-blue-400 hover:underline break-words">{article.title}</a>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{article.published ? new Date(article.published).toLocaleString() : ''}</div>
                            <div className="flex items-center gap-2 mt-1 relative">
                              <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition" aria-label="Archive">✅</button>
                              <button onClick={() => toggleSaved(article)} title={article.saved ? 'Unsave' : 'Save'} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition" aria-label={article.saved ? 'Unsave' : 'Save'}>🔖</button>
                              {justAction?.link === article.link && justAction?.type === 'saved' && <span className="text-green-500 ml-1 text-xs">Saved!</span>}
                              {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                              <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1" aria-label="AI Summary" disabled={!article.link}>💡 AI Summary</button>
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
            <li className="text-gray-400 dark:text-gray-600">Loading saved articles...</li>
          ) : errorSaved ? (
            <li className="text-red-500">{errorSaved}</li>
          ) : savedArticles.length === 0 ? (
            <li className="text-gray-400 dark:text-gray-600">No saved articles.</li>
          ) : (
            savedArticles.map((article, idx) => (
              <li key={idx} className="mb-5 pb-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg shadow-sm px-3 py-3 flex flex-col gap-2">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 dark:text-blue-400 hover:underline break-words">{article.title}</a>
                <div className="text-xs text-gray-500 dark:text-gray-400">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => archiveArticle(article)} title="Archive" className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition" aria-label="Archive">✅</button>
                  <button onClick={() => removeSaved(article)} title="Remove" className="p-1 text-red-500 dark:text-red-600 hover:text-red-700 dark:hover:text-red-500 transition" aria-label="Remove">🗑️</button>
                  {justAction?.link === article.link && justAction?.type === 'removed' && <span className="text-red-500 ml-1 text-xs">Removed!</span>}
                  <button onClick={() => handleFetchSummary(article.link ?? '')} title="AI Summary" className="px-2 py-1 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1" aria-label="AI Summary" disabled={!article.link}>💡 AI Summary</button>
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
