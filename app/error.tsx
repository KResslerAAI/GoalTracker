'use client';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Something went wrong</h1>
      <p>{error.message || 'An unexpected error occurred.'}</p>
      <button onClick={reset} style={{ marginTop: '1rem' }}>
        Try again
      </button>
    </main>
  );
}
