import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-[#e5e5e5] bg-[#fafafa]">
      <div className="container mx-auto px-4 md:px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2 space-y-6">
            <span className="text-xl font-bold tracking-tight text-black block">Devbox SDK</span>
            <p className="text-[#666] max-w-sm text-sm leading-relaxed">
              Enterprise TypeScript SDK for Sealos Devbox. 
              Building the future of programmatic cloud environments.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-black text-sm">Resources</h4>
            <ul className="space-y-4 text-sm text-[#666]">
              <li><Link href="/docs" className="hover:text-black transition-colors">Documentation</Link></li>
              <li><a href="https://github.com/zjy365/devbox-sdk" className="hover:text-black transition-colors">GitHub</a></li>
              <li><a href="https://www.npmjs.com/package/@sealos/devbox-sdk" className="hover:text-black transition-colors">NPM</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-black text-sm">Legal</h4>
            <ul className="space-y-4 text-sm text-[#666]">
              <li><Link href="/privacy" className="hover:text-black transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-black transition-colors">Terms of Service</Link></li>
              <li><a href="https://sealos.io" className="hover:text-black transition-colors">Sealos</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-[#e5e5e5] pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[#888]">
          <div>© {new Date().getFullYear()} Devbox SDK. Apache 2.0.</div>
          <div className="flex gap-6">
             <span>Designed for Sealos</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
