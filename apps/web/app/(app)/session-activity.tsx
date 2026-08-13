'use client';

import { useEffect, useState } from 'react';

const IDLE_LIMIT_MS = 10 * 60_000;
const WARNING_MS = 60_000;

export function SessionActivity() {
  const [remaining, setRemaining] = useState(IDLE_LIMIT_MS);

  useEffect(() => {
    let lastActivity = Date.now();
    let signingOut = false;
    const markActive = () => {
      lastActivity = Date.now();
      setRemaining(IDLE_LIMIT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    const timer = window.setInterval(() => {
      const next = Math.max(0, IDLE_LIMIT_MS - (Date.now() - lastActivity));
      setRemaining(next);
      if (next === 0 && !signingOut) {
        signingOut = true;
        void fetch('/api/auth/sign-out', { method: 'POST' }).finally(() => {
          window.location.assign('/login?error=timeout');
        });
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, []);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const warning = remaining <= WARNING_MS;
  return (
    <p className={warning ? 'session-warning' : 'session-status'} aria-live="polite">
      {warning
        ? `Session expires in ${minutes}:${seconds.toString().padStart(2, '0')}`
        : 'Session active'}
    </p>
  );
}
