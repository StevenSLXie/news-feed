import { NextRequest } from 'next/server';
import { prisma } from "../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const userEmail = session.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  return user?.id || null;
}

export async function POST(req: NextRequest) {
  const { link } = await req.json();
  if (!link) {
    return Response.json({ error: 'Missing article link' }, { status: 400 });
  }
  const userId = await getUserIdFromSession();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  try {
    await prisma.removedArticle.create({
      data: {
        userId,
        link,
      },
    });
    return Response.json({ success: true });
  } catch {
    // error intentionally ignored
    return Response.json({ error: 'Failed to remove article' }, { status: 500 });
  }
}
