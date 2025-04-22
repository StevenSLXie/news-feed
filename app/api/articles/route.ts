import { NextRequest } from 'next/server';
import pool from '../../../lib/db';
import Parser from 'rss-parser';

const parser = new Parser();
const USER_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(req: NextRequest) {
  try {
    // Get all feeds for the current user
    const { rows: feeds } = await pool.query('SELECT id, url, title FROM feeds WHERE user_id = $1', [USER_ID]);
    // Get all removed article links for this user
    const { rows: removed } = await pool.query('SELECT link FROM removed_articles WHERE user_id = $1', [USER_ID]);
    const removedLinks = new Set(removed.map((r: any) => r.link));
    let articles: any[] = [];
    for (const feed of feeds) {
      try {
        const parsed = await parser.parseURL(feed.url);
        const feedArticles = (parsed.items || []).map(item => ({
          feedId: feed.id,
          feedTitle: feed.title || feed.url,
          title: item.title,
          link: item.link,
          published: item.pubDate,
        }));
        // Filter out removed articles
        articles = articles.concat(feedArticles.filter(a => !removedLinks.has(a.link)));
      } catch (err) {
        console.warn('GET /api/articles: Failed to parse feed', feed.url, err);
        // Ignore feeds that fail to fetch/parse
      }
    }
    articles.sort((a, b) => {
      const aDate = a.published ? new Date(a.published).getTime() : 0;
      const bDate = b.published ? new Date(b.published).getTime() : 0;
      return bDate - aDate;
    });
    return Response.json(articles, { status: 200 });
  } catch (error) {
    console.error('GET /api/articles: Unexpected error', error);
    return Response.json({ error: 'Failed to fetch articles' }, { status: 500 });
  }
}
