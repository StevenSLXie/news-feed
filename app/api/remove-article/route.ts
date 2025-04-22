import { NextRequest } from 'next/server';
import pool from '../../../lib/db';

const USER_ID = '00000000-0000-0000-0000-000000000001';

export async function POST(req: NextRequest) {
  const { link } = await req.json();
  if (!link) {
    return Response.json({ error: 'Missing article link' }, { status: 400 });
  }
  try {
    await pool.query(
      'INSERT INTO removed_articles (user_id, link) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [USER_ID, link]
    );
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to remove article' }, { status: 500 });
  }
}
