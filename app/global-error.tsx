'use client';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h1>Application error</h1>
        <p>{error.message || 'An unexpected error occurred.'}</p>
        <button onClick={reset} style={{ marginTop: '1rem' }}>
          Reload
        </button>
      </body>
    </html>
  );
}
