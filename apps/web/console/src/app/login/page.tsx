'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo, Button } from '@fisheye/ui';

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
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setPending(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
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
          result.error ?? 'Sign-in failed. Check your email and password.',
        );
        return;
      }

      router.replace('/overview');
    } catch {
      setMessage('The sign-in service could not be reached. Try again.');
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
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <h2>Analyst sign in</h2>
          <p>Sign in to continue.</p>
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
        </form>
      </section>
    </main>
  );
}
