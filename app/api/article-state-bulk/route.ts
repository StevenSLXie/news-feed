import { NextRequest } from 'next/server';
import pool from '../../../lib/db';

const USER_ID = '00000000-0000-0000-0000-000000000001';

export async function POST(req: NextRequest) {
  try {
    const { articles } = await req.json();
    if (!Array.isArray(articles)) return Response.json({}, { status: 400 });
    const links = articles.map((a: any) => a.link).filter(Boolean);
    if (links.length === 0) return Response.json({}, { status: 200 });
    const { rows } = await pool.query(
      `SELECT link, read, saved FROM articles WHERE user_id = $1 AND link = ANY($2)`,
      [USER_ID, links]
    );
    const stateMap: Record<string, {read: boolean, saved: boolean}> = {};
    for (const row of rows) {
      stateMap[row.link] = { read: row.read, saved: row.saved };
    }
    return Response.json(stateMap, { status: 200 });
  } catch (error) {
    return Response.json({}, { status: 500 });
  }
}
