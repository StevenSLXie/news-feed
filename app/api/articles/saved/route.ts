import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const saved = await prisma.article.findMany({
    where: { userId: user.id, saved: true },
    include: { feed: true },
    orderBy: { publishedAt: 'desc' },
  });
  return NextResponse.json(
    saved.map(a => ({
      feedId: a.feedId,
      feedTitle: a.feed.title,
      title: a.title,
      link: a.link,
      published: a.publishedAt?.toISOString() ?? null,
    })),
    { status: 200 }
  );
}