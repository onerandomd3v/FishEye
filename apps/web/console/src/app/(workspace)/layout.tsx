import { ConsoleShell } from '../../components/ConsoleShell';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEMO_SESSION_COOKIE, verifyDemoSession } from '../../lib/demo-auth';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const authenticated = await verifyDemoSession(
    cookieStore.get(DEMO_SESSION_COOKIE)?.value,
  );
  if (!authenticated) redirect('/login');

  return <ConsoleShell>{children}</ConsoleShell>;
}
