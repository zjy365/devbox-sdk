import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 md:px-6 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <span className="font-bold text-xl block mb-4">Devbox SDK</span>
            <p className="text-muted-foreground max-w-sm">
              Enterprise TypeScript SDK for Sealos Devbox. 
              Building the future of programmatic cloud environments.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link></li>
              <li><a href="https://github.com/zjy365/devbox-sdk" className="hover:text-foreground transition-colors">GitHub</a></li>
              <li><a href="https://www.npmjs.com/package/@sealos/devbox-sdk" className="hover:text-foreground transition-colors">NPM</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
              <li><a href="https://sealos.io" className="hover:text-foreground transition-colors">Sealos</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div>© {new Date().getFullYear()} Devbox SDK. Apache 2.0.</div>
        </div>
      </div>
    </footer>
  )
}

