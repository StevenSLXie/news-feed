import { NextRequest } from 'next/server';
import pool from '../../../lib/db';

const USER_ID = '00000000-0000-0000-0000-000000000001';

export async function POST(req: NextRequest) {
  const { link, read, saved, title, feedId, published } = await req.json();
  if (!link || !feedId) return Response.json({ error: 'Missing required fields' }, { status: 400 });
  try {
    const result = await pool.query(
      `INSERT INTO articles (user_id, feed_id, link, title, published_at, read, saved)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, link) DO UPDATE SET read = $6, saved = $7
       RETURNING id, read, saved`,
      [USER_ID, feedId, link, title, published, read, saved]
    );
    return Response.json(result.rows[0], { status: 200 });
  } catch (error) {
    return Response.json({ error: 'Failed to update article state' }, { status: 500 });
  }
}
