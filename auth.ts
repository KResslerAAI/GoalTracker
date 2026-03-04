import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { getMockUserByEmail, isMockMode, updateMockUser } from "@/lib/mock-store";

const providers: Provider[] = [];
const allowInsecureCredentialsAuth =
  isMockMode ||
  process.env.ALLOW_INSECURE_CREDENTIALS_AUTH === "true" ||
  process.env.NODE_ENV !== "production";

if (allowInsecureCredentialsAuth) {
  providers.push(
    CredentialsProvider({
      name: "Local Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" }
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const name = String(credentials?.name ?? "").trim() || null;

        if (!email) {
          return null;
        }

        if (isMockMode) {
          const user = getMockUserByEmail(email);
          if (!user || !user.active) {
            return null;
          }

          if (name && user.name !== name) {
            updateMockUser(user.id, { name });
          }

          const latest = getMockUserByEmail(email);
          if (!latest) return null;
          return {
            id: latest.id,
            email: latest.email,
            name: latest.name,
            role: latest.role,
            teamId: latest.teamId
          };
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          return null;
        }

        if (name && user.name !== name) {
          await prisma.user.update({
            where: { id: user.id },
            data: { name }
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name
        };
      }
    })
  );
}

if (!isMockMode && process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
  providers.push(
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  ...(isMockMode
    ? {
        session: {
          strategy: "jwt" as const
        }
      }
    : {
        adapter: PrismaAdapter(prisma),
        session: {
          strategy: "database" as const
        }
      }),
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teamId = user.teamId;
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        if (user) {
          session.user.id = user.id;
          session.user.role = user.role;
          session.user.teamId = user.teamId;
        } else {
          session.user.id = String(token.sub ?? session.user.id ?? "");
          session.user.role = token.role as typeof session.user.role;
          session.user.teamId = (token.teamId as string | null | undefined) ?? null;
        }
      }
      return session;
    }
  }
});
