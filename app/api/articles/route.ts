import { NextRequest } from 'next/server';
import Parser from 'rss-parser';
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";

const parser = new Parser();

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userEmail = session.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  return user?.id || null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) return new Response("Unauthorized", { status: 401 });
    // Get all feeds for the current user
    const feeds = await prisma.feed.findMany({
      where: { userId },
      select: { id: true, url: true, title: true }
    });
    // Get all removed article links for this user
    const removed = await prisma.removedArticle.findMany({
      where: { userId },
      select: { link: true }
    });
    const removedLinks = new Set(removed.map((r: { link: string }) => r.link));
    let articles: { feedId: number, feedTitle: string, title: string, link: string, published: string | null }[] = [];
    for (const feed of feeds) {
      try {
        const parsed = await parser.parseURL(feed.url);
        const items = (parsed.items || []).map(item => ({
          feedId: feed.id,
          feedTitle: feed.title || '',
          title: item.title ?? '',
          link: item.link ?? '',
          published: item.pubDate ?? null
        }));
        // Filter out removed articles
        articles = articles.concat(items.filter(a => !removedLinks.has(a.link)));
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
