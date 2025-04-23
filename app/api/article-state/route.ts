import { NextRequest } from 'next/server';
import { prisma } from "../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route"; // adjust path as needed

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userEmail = session.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  return user?.id || null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { link, read, saved, title, feedId, published } = await NextRequest.json();
    if (!link || !feedId) return Response.json({ error: 'Missing required fields' }, { status: 400 });
    const userId = await getUserIdFromSession();
    if (!userId) return new Response("Unauthorized", { status: 401 });
    const result = await prisma.article.upsert({
      where: { userId_link: { userId, link } },
      update: { read, saved },
      create: { userId, feedId, link, title, publishedAt: published, read, saved },
      select: { id: true, read: true, saved: true }
    });
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: 'Failed to update article state' }, { status: 500 });
  }
}
