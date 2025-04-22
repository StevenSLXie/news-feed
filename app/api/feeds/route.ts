import { NextRequest } from 'next/server';
import pool from '../../../lib/db';
import Parser from 'rss-parser';

const parser = new Parser();
const USER_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(req: NextRequest) {
  try {
    const { rows } = await pool.query('SELECT id, url, title FROM feeds WHERE user_id = $1 ORDER BY created_at DESC', [USER_ID]);
    return Response.json(rows, { status: 200 });
  } catch (error) {
    console.error('GET /api/feeds error:', error);
    return Response.json({ error: 'Failed to fetch feeds' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { url, title } = await req.json();
  if (!url) {
    console.warn('POST /api/feeds: Missing url');
    return Response.json({ error: 'Missing url' }, { status: 400 });
  }

  // Emulate browser headers for RSS fetch
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US,en;q=0.8',
        'Referer': url,
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`POST /api/feeds: Feed returned HTTP ${res.status} for ${url}`);
      return Response.json({ error: `Feed returned HTTP ${res.status}` }, { status: 400 });
    }
    const xml = await res.text();
    try {
      await parser.parseString(xml); // Will throw if not valid RSS/Atom
    } catch (parseErr) {
      console.warn('POST /api/feeds: RSS parse error for', url, parseErr);
      return Response.json({ error: 'Invalid RSS/Atom format: ' + (parseErr?.message || parseErr) }, { status: 400 });
    }
  } catch (err) {
    console.error('POST /api/feeds: Fetch error for', url, err);
    return Response.json({ error: 'Invalid or unreachable RSS feed: ' + (err?.message || err) }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO feeds (user_id, url, title) VALUES ($1, $2, $3) RETURNING id, url, title',
      [USER_ID, url, title || null]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/feeds: DB error for', url, error);
    return Response.json({ error: 'Failed to add feed: ' + (error?.message || error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    console.warn('DELETE /api/feeds: Missing id');
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }
  try {
    await pool.query('DELETE FROM feeds WHERE id = $1 AND user_id = $2', [id, USER_ID]);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/feeds: DB error for', id, error);
    return Response.json({ error: 'Failed to delete feed: ' + (error?.message || error) }, { status: 500 });
  }
}
