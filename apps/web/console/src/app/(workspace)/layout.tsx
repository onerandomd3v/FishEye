import { ConsoleShell } from '../../components/ConsoleShell';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOCAL_SESSION_COOKIE, verifyLocalSession } from '../../lib/local-auth';
import { decryptSession, SESSION_COOKIE } from '../../lib/oidc';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get(LOCAL_SESSION_COOKIE)?.value;

  const oidcSession = await decryptSession(
    cookieStore.get(SESSION_COOKIE)?.value,
  );
  const localAuthenticated =
    process.env.NODE_ENV === 'development' &&
    (await verifyLocalSession(session));

  if (!oidcSession && !localAuthenticated) {
    redirect('/login');
  }

  return <ConsoleShell>{children}</ConsoleShell>;
}
