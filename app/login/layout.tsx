import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to RafayGen AI Studio.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = (await getServerSession(authOptions as never)) as
    | { user?: { id?: string } }
    | null;
  if (session?.user?.id) {
    redirect("/");
  }
  return children;
}
