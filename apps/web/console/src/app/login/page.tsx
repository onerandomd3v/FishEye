'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo, Button, Notice } from '@fisheye/ui';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="login-page" aria-busy="true">
          <section className="login-form-panel">Loading sign-in…</section>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const signInFailed = searchParams.get('error') === 'oidc';

  if (process.env.NODE_ENV !== 'development') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/" aria-label="FishEye home">
            <BrandLogo />
          </Link>
          <div className="login-brand-copy">
            <h1>
              See the signal.
              <br />
              Ignore the noise.
            </h1>
            <p>Context-aware insider-risk triage for security analysts.</p>
          </div>
          <p className="login-foot">Synthetic research environment</p>
        </section>
        <section className="login-form-panel">
          <div className="login-form">
            <h2>Analyst sign in</h2>
            <p>Sign in through your organization’s identity provider.</p>
            {signInFailed && (
              <div role="alert">
                <Notice title="Sign-in could not be completed">
                  Check your access with your administrator and try again.
                </Notice>
              </div>
            )}
            <a className="fe-button fe-button-primary" href="/api/auth/login">
              Continue with secure sign-in <span aria-hidden="true">→</span>
            </a>
            <p className="login-disclaimer">
              FishEye accepts analyst access tokens issued by the configured
              OIDC provider. If sign-in fails, check access with your
              administrator and try again.
            </p>
          </div>
        </section>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPending(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(
          result.error ?? 'Sign-in failed. Check your local demo credentials.',
        );
        return;
      }

      router.replace('/overview');
    } catch {
      setMessage('The local sign-in service could not be reached. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/" aria-label="FishEye home">
          <BrandLogo />
        </Link>
        <div className="login-brand-copy">
          <h1>
            See the signal.
            <br />
            Ignore the noise.
          </h1>
          <p>Context-aware insider-risk triage for security analysts.</p>
        </div>
        <p className="login-foot">Synthetic research environment</p>
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="fixture-chip">Development preview</span>
          <h2>Analyst sign in</h2>
          <p>Access the FishEye research workspace.</p>
          <Notice title="Local demo sign-in">
            Use the credentials configured in{' '}
            <code>apps/web/console/.env.local</code>. This local preview does
            not connect to a bank.
          </Notice>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              required
            />
          </div>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? 'Signing in…' : 'Continue'}{' '}
            {!pending && <span aria-hidden="true">→</span>}
          </Button>
          {message && (
            <p className="local-confirmation" role="status">
              {message}
            </p>
          )}
          <p className="login-disclaimer">
            Local demo access only. No live bank connection or real analyst
            identity provider is connected.
          </p>
        </form>
      </section>
    </main>
  );
}
