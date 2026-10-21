import { ConsoleShell } from '../../components/ConsoleShell';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
