import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>DevOps Automation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Control plane for CI/CD pipelines, workers, and AI-assisted config."
        />
      </Head>
      <header className="nav-shell">
        <div className="nav-inner">
          <Link href="/" className="brand">
            DevOps<span>Auto</span>
          </Link>
          <nav className="nav-links">
            <Link href="/pipelines">Pipelines</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/ai">AI workflow</Link>
          </nav>
        </div>
      </header>
      <main>
        <Component {...pageProps} />
      </main>
    </>
  );
}
