import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import GitHubProvider from "next-auth/providers/github";
// import GoogleProvider from "next-auth/providers/google";
import type { SessionStrategy } from "next-auth";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    // Add GoogleProvider or other providers here if needed
  ],
  session: {
    strategy: "jwt" as SessionStrategy,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
