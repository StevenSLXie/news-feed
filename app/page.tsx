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
    } catch (e) {
      setError('Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }

  async function fetchArticles() {
    setError(null);
    try {
      const res = await fetch('/api/articles');
      const data = await res.json();
      // Try to fetch read/saved state for each article
      const stateRes = await fetch('/api/article-state-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: data }), credentials: 'include' });
      let stateMap: Record<string, {read: boolean, saved: boolean}> = {};
      if (stateRes.ok) {
        stateMap = await stateRes.json();
      }
      setArticles(data.map((a: Article) => ({ ...a, ...stateMap[a.link || ''] }))); 
    } catch (e) {
      setError('Failed to load articles');
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
    } catch {}
  }

  async function removeArticle(article: Article) {
    try {
      await fetch('/api/remove-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: article.link }),
        credentials: 'include',
      });
      // Remove the article from local state without refreshing
      setArticles(prev => prev.filter(a => a.link !== article.link));
    } catch {}
  }

  if (status === "loading") {
    return <div>Loading authentication...</div>;
  }

  if (!session) {
    return (
      <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontWeight: 500 }}>My News Feeds</h1>
        <p style={{ margin: '32px 0' }}>You are not signed in.</p>
        <button onClick={() => signIn()} style={{ fontSize: 16, padding: '8px 24px', borderRadius: 6, border: '1px solid #ccc', background: '#1a0dab', color: '#fff', cursor: 'pointer' }}>Sign in with GitHub</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontWeight: 500 }}>My News Feeds</h1>
        <div style={{ fontSize: 15, color: '#555', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Signed in as {session.user?.email}</span>
          <button onClick={() => signOut()} style={{ fontSize: 14, padding: '4px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#eee', color: '#444', cursor: 'pointer' }}>Sign out</button>
        </div>
      </div>
      <form onSubmit={addFeed} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="url"
          placeholder="Add RSS feed URL..."
          value={newFeedUrl}
          onChange={e => setNewFeedUrl(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
          required
        />
        <button type="submit" style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: '#222', color: '#fff' }} disabled={loading}>
          Add
        </button>
      </form>
      {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
      {loading && <div>Loading...</div>}
      <h2 style={{ marginTop: 32, fontSize: 18, cursor: 'pointer', userSelect: 'none' }} onClick={() => setFeedsCollapsed(c => !c)}>
        Subscribed Feeds
        <span style={{ marginLeft: 8, fontSize: 14, color: '#888' }}>{feedsCollapsed ? '▼' : '▲'}</span>
      </h2>
      {!feedsCollapsed && (
        <ul style={{ paddingLeft: 0, listStyle: 'none', marginBottom: 24 }}>
          {feeds.map(feed => (
            <li key={feed.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {feed.title ? feed.title : feed.url}
              </span>
              <button onClick={() => removeFeed(feed.id)} style={{ marginLeft: 8, color: '#c00', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }} title="Unsubscribe">×</button>
            </li>
          ))}
          {feeds.length === 0 && <li style={{ color: '#888' }}>No feeds subscribed.</li>}
        </ul>
      )}
      <h2 style={{ fontWeight: 500, fontSize: 22, margin: '16px 0 8px' }}>Articles</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {articles.map((article, idx) => (
          <li key={idx} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #eee', background: article.read ? '#f7f7f7' : undefined }}>
            <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 17, fontWeight: 500, color: '#1a0dab', textDecoration: 'none' }}>{article.title}</a>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{article.feedTitle} &middot; {article.published ? new Date(article.published).toLocaleString() : ''}</div>
            <div style={{ marginTop: 4, display: 'flex', gap: 10 }}>
              <button onClick={() => toggleRead(article)} style={{ fontSize: 12, color: article.read ? '#0a0' : '#888', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>{article.read ? 'Read' : 'Mark as Read'}</button>
              <button onClick={() => toggleSaved(article)} style={{ fontSize: 12, color: article.saved ? '#09c' : '#888', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>{article.saved ? 'Saved' : 'Save'}</button>
              <button onClick={() => removeArticle(article)} style={{ fontSize: 12, color: '#c00', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Remove</button>
            </div>
          </li>
        ))}
        {articles.length === 0 && <li style={{ color: '#888' }}>No articles to show.</li>}
      </ul>
    </main>
  );
}
