import { useEffect, useState } from 'react';

export default function DarkModeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <button
      className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 shadow"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setDark((d) => !d)}
      style={{ fontSize: 13, fontWeight: 600 }}
    >
      {dark ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
