import { ConsoleShell } from '../../components/ConsoleShell';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOCAL_SESSION_COOKIE, verifyLocalSession } from '../../lib/local-auth';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get(LOCAL_SESSION_COOKIE)?.value;

  if (!(await verifyLocalSession(session))) {
    redirect('/login');
  }

  return <ConsoleShell>{children}</ConsoleShell>;
}
