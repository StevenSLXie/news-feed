import { NextRequest } from 'next/server';
import { prisma } from "../../../lib/prisma";
import Parser from 'rss-parser';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

const parser = new Parser();

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userEmail = session.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  return user?.id || null;
}

export async function GET() {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const feeds = await prisma.feed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return Response.json(feeds, { status: 200 });
  } catch (error) {
    console.error('GET /api/feeds error:', error);
    return Response.json({ error: 'Failed to fetch feeds' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) {
    console.warn('POST /api/feeds: Missing url');
    return Response.json({ error: 'Missing url' }, { status: 400 });
  }
  const userId = await getUserIdFromSession();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let feedTitle: string | undefined = undefined;
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
    let parsed: Record<string, unknown>;
    try {
      parsed = await parser.parseString(xml) as Record<string, unknown>;
      // Try to extract title from RSS or Atom
      const candidateTitle = parsed?.title
        || (parsed?.feed && (parsed.feed as Record<string, unknown>).title)
        || (parsed?.rss && (parsed.rss as Record<string, unknown>).channel && ((parsed.rss as Record<string, unknown>).channel as Record<string, unknown>).title);
      if (candidateTitle && typeof candidateTitle === 'object' && candidateTitle !== null) {
        if (typeof (candidateTitle as { _text?: string })._text === 'string') {
          feedTitle = (candidateTitle as { _text: string })._text;
        } else if (typeof (candidateTitle as { value?: string }).value === 'string') {
          feedTitle = (candidateTitle as { value: string }).value;
        } else {
          const values = Object.values(candidateTitle);
          feedTitle = values.length > 0 && typeof values[0] === 'string' ? values[0] : undefined;
        }
      } else if (typeof candidateTitle === 'string') {
        feedTitle = candidateTitle;
      }
      if (!feedTitle) {
        // Fallback: use domain name
        feedTitle = new URL(url).hostname.replace(/^www\./, '');
      }
    } catch (parseErr) {
      console.warn('POST /api/feeds: RSS parse error for', url, parseErr);
      let errorMsg: string;
      if (parseErr instanceof Error) {
        errorMsg = parseErr.message;
      } else {
        errorMsg = String(parseErr);
      }
      return Response.json({ error: `Invalid RSS/Atom format: ${errorMsg}` }, { status: 400 });
    }
  } catch (err) {
    console.error('POST /api/feeds: Fetch error for', url, err);
    const fetchErrorMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Invalid or unreachable RSS feed: ${fetchErrorMsg}` }, { status: 400 });
  }
  try {
    const feed = await prisma.feed.create({ data: { userId, url, title: feedTitle } });
    return Response.json(feed, { status: 201 });
  } catch (error) {
    console.error('POST /api/feeds: DB error for', url, error);
    const dbErrorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Failed to add feed: ${dbErrorMsg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    console.warn('DELETE /api/feeds: Missing id');
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }
  const userId = await getUserIdFromSession();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await prisma.feed.delete({ where: { id, userId } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/feeds: DB error for', id, error);
    const deleteErrorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Failed to delete feed: ${deleteErrorMsg}` }, { status: 500 });
  }
}
