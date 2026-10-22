'use client';

import { BrandLogo } from '@fisheye/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@fisheye/ui';

const links = [
  { href: '/overview', label: 'Overview' },
  { href: '/investigations', label: 'Investigations' },
  { href: '/evaluation', label: 'Evaluation' },
  { href: '/scenarios', label: 'Scenario lab' },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const current = links.find((link) => pathname.startsWith(link.href));

  async function signOut() {
    setSignOutError(false);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign-out request failed.');
      router.replace('/login');
    } catch {
      setSignOutError(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    sidebarRef.current?.querySelector<HTMLAnchorElement>('.nav-link')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="workspace">
      <button
        className={`drawer-backdrop${open ? ' is-visible' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
      />
      <aside
        ref={sidebarRef}
        id="primary-navigation"
        className={`sidebar${open ? ' is-open' : ''}`}
        aria-label="Main navigation"
      >
        <Link
          className="sidebar-brand flex flex-col"
          href="/overview"
          onClick={() => setOpen(false)}
          aria-label="FishEye overview"
        >
          <BrandLogo compact />
          <span className="sidebar-kicker">INSIDER RISK TRIAGE</span>
        </Link>
        <nav className="main-nav grid gap-1">
          {links.map((link) => {
            const active = current?.href === link.href;
            return (
              <Link
                className="nav-link"
                href={link.href}
                key={link.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="nav-glyph" aria-hidden="true">
                  {active ? '●' : '○'}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <strong>Research workspace</strong>
          <span>Synthetic data only</span>
        </div>
      </aside>

      <div className="main-area">
        <div className="mobile-topbar">
          <Link href="/overview" aria-label="FishEye overview">
            <BrandLogo compact />
          </Link>
          <button
            className="mobile-menu-button"
            ref={menuButtonRef}
            type="button"
            aria-expanded={open}
            aria-controls="primary-navigation"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setOpen(!open)}
          >
            {open ? '×' : '☰'}
          </button>
        </div>
        <header className="topbar flex items-center justify-between text-fe-secondary">
          <div className="breadcrumbs">
            FishEye&nbsp; / &nbsp;{current?.label ?? 'Research workspace'}
          </div>
          <div className="flex items-center gap-3">
            <span className="fixture-chip">Development fixture</span>
            {signOutError && (
              <span role="alert">Could not sign out. Try again.</span>
            )}
            <Button type="button" variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
