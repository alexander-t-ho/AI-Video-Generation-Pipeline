import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      companyId: string;
      companyName: string;
      role: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User extends DefaultUser {
    id: string;
    companyId: string;
    companyName: string;
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    companyId: string;
    companyName: string;
    role: string;
  }
}
