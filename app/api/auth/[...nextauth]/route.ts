import NextAuth from "next-auth";
// import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// You can add more providers (Google, etc.) in the providers array
export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    })
  ],
  // Optional: Callbacks, session config, etc.
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };