import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
      role?: string;
      scope?: string;
      clientId?: string;
      buildingId?: string;
      orgId?: string;
    }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      scope?: string;
      clientId?: string;
      buildingId?: string;
      orgId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
      role?: string;
      scope?: string;
      clientId?: string;
      buildingId?: string;
      orgId?: string;
    }
}
