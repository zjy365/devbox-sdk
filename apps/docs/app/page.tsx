import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold">Devbox SDK</h1>
          <p className="text-xl text-muted-foreground">
            Enterprise TypeScript SDK for Sealos Devbox management with HTTP API + Bun runtime architecture
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-12">
          <Link
            href="/docs"
            className="p-6 border rounded-lg hover:bg-accent transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">📚 Documentation</h2>
            <p className="text-muted-foreground">
              View complete API documentation and usage guides
            </p>
          </Link>

          <a
            href="https://github.com/zjy365/devbox-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="p-6 border rounded-lg hover:bg-accent transition-colors"
          >
            <h2 className="text-2xl font-semibold mb-2">🔗 GitHub</h2>
            <p className="text-muted-foreground">
              Access source code and contribution guidelines
            </p>
          </a>
        </div>

        <div className="mt-12 p-6 bg-muted rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Quick Start</h2>
          <div className="space-y-2">
            <div>
              <code className="text-sm bg-background p-2 rounded block">
                npm install @sealos/devbox-sdk
              </code>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Check out the <Link href="/docs" className="underline">documentation</Link> for more information
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

