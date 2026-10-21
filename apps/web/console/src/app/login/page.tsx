'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BrandLogo, Button, Notice } from '@fisheye/ui';

export default function LoginPage() {
  const [message, setMessage] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      'Authentication is not connected. No credentials were checked and no session was created.',
    );
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
          <Notice title="Sign-in is not available yet">
            This preview has no authentication service. Submitting will not
            create an account or sign you in.
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
          <Button type="submit">
            Continue <span aria-hidden="true">→</span>
          </Button>
          {message && (
            <p className="local-confirmation" role="status">
              {message}
            </p>
          )}
          <p className="login-disclaimer">
            Demo sign-in only. No live bank connection. This prototype does not
            verify your identity.
          </p>
        </form>
      </section>
    </main>
  );
}
