import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "./lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { role: true, client: true, building: true },
        });
        if (!user?.passwordHash || !user.role.active) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.name,
          scope: user.role.scope,
          clientId: user.clientId ?? undefined,
          buildingId: user.buildingId ?? undefined,
          orgId: user.orgId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
if (user) {
        token.role = user.role;
        token.scope = user.scope;
        token.clientId = user.clientId;
        token.buildingId = user.buildingId;
        token.orgId = user.orgId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as string;
        session.user.scope = token.scope as string;
        session.user.clientId = token.clientId as string | undefined;
        session.user.buildingId = token.buildingId as string | undefined;
        session.user.orgId = token.orgId as string | undefined;
      }   
      return session;
    },
  },
});
