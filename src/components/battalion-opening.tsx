"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const RECENT_OPENING = 'samgad:opening-at';

export default function BattalionOpening() {
  const [visible, setVisible] = useState(true);
  const deputies = usePathname().startsWith('/deputies');

  useEffect(() => {
    // A sign-in redirect or a quick reload should not replay the introduction.
    let recent = false;
    try {
      const previous = Number(sessionStorage.getItem(RECENT_OPENING));
      recent = previous > 0 && Date.now() - previous < 60_000;
      sessionStorage.setItem(RECENT_OPENING, String(Date.now()));
    } catch { /* The introduction also works when browser storage is disabled. */ }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setVisible(false), recent || reduced ? 0 : 2400);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="battalion-opening" aria-hidden="true" onClick={() => setVisible(false)}>
      <div className="opening-emblem">
        <svg className="opening-outline" viewBox="0 0 512 512" fill="none">
          <path pathLength="1" d="M114 60H401V250C401 345 339 410 256 451C173 410 114 345 114 250Z" />
        </svg>
        <div className="opening-crest" />
        <div className="opening-glint" />
      </div>
      <div className="opening-caption">
        <strong>{deputies ? "סגני המחץ" : "סמג״ד המחץ"}</strong>
        <span>ברמה אחרת</span>
      </div>
    </div>
  );
}
