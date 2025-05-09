import { NextRequest } from 'next/server';
import pool from '../../../lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "../../../lib/prisma";

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  console.log('DEBUG: session from getServerSession', session);
  if (!session) return null;
  const userEmail = session.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  return user?.id || null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { articles } = await req.json();
    if (!Array.isArray(articles)) return Response.json({ error: "Bad Request" }, { status: 400 });
    const links = articles.map(a => a.link).filter(Boolean);
    if (links.length === 0) return Response.json({}, { status: 200 });
    const userId = await getUserIdFromSession();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { rows } = await pool.query(
      `SELECT link, read, saved FROM articles WHERE user_id = $1 AND link = ANY($2)`,
      [userId, links]
    );
    const stateMap: Record<string, {read: boolean, saved: boolean}> = {};
    for (const row of rows) {
      stateMap[row.link] = { read: row.read, saved: row.saved };
    }
    return Response.json(stateMap, { status: 200 });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
