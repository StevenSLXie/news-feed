'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";

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

  useEffect(() => {
    fetchFeeds();
    fetchArticles();
  }, []);

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
          className="flex-1 px-3 py-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 text-base bg-white"
          required
        />
        <button type="submit" className="px-5 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-60" disabled={loading}>
          Add
        </button>
      </form>
      {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
      {loading && <div className="text-gray-500 mb-4">Loading...</div>}
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
        Articles
        <button onClick={fetchArticles} className="ml-2 px-3 py-1.5 rounded border border-gray-300 bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 transition">Refresh</button>
      </h2>
      <ul className="list-none p-0">
        {loadingArticles ? (
          <li className="text-gray-400">Loading articles...</li>
        ) : articles.length === 0 ? (
          <li className="text-gray-400">No articles to show.</li>
        ) : (
          articles.map((article, idx) => (
            <li key={idx} className="mb-5 pb-4 border-b border-gray-100 bg-white rounded-lg shadow-sm px-3 py-3 flex flex-col gap-1 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="block text-base font-medium text-blue-700 hover:underline truncate">{article.title}</a>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
              </div>
              <div className="flex gap-2 mt-2 sm:mt-0 sm:ml-4">
                <button onClick={() => toggleRead(article)} className={`text-xs px-3 py-1 rounded border ${article.read ? 'border-green-400 text-green-700 bg-green-50' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-green-100 transition`}>{article.read ? 'Read' : 'Mark as Read'}</button>
                <button onClick={() => toggleSaved(article)} className={`text-xs px-3 py-1 rounded border ${article.saved ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-500 bg-white'} hover:bg-blue-100 transition`}>{article.saved ? 'Saved' : 'Save'}</button>
                <button onClick={() => removeArticle(article)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-500 bg-white hover:bg-red-50 transition">Remove</button>
              </div>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
