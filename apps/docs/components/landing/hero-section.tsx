"use client"

import Link from "next/link"
import { ArrowRight, Github, Terminal, GitBranch } from "lucide-react"
import { motion } from "motion/react"

export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden py-20 md:py-32 lg:py-40">
      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]" />
        <div className="absolute right-[-20%] top-[-10%] -z-10 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] -z-10 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          {/* Text Content */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col justify-center space-y-8"
          >
            <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors border-primary/20 bg-primary/5 text-primary w-fit">
              v1.0.0 Enterprise Ready
            </div>
            
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight text-foreground">
                Programmatic <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600">
                  Cloud Development
                </span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-[600px] leading-relaxed">
                The enterprise TypeScript SDK for Sealos Devbox. Spin up, manage, and control 
                isolated cloud development environments for AI Agents, CI/CD, and specialized 
                infrastructure.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/docs"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-12 px-8"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <a
                href="https://github.com/zjy365/devbox-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-12 px-8"
              >
                <Github className="mr-2 h-4 w-4" />
                View on GitHub
              </a>
            </div>
          </motion.div>

          {/* Code Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative lg:h-[600px] flex items-center justify-center"
          >
            <div className="relative w-full max-w-lg rounded-xl border border-[#333] bg-[#1e1e1e] shadow-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              
              {/* Window Controls */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-[#333]">
                <div className="flex items-center gap-2">
                  <div className="ml-0 text-xs text-[#cccccc] font-sans flex items-center gap-2">
                    <Terminal className="w-3 h-3 text-blue-400" />
                    <span>agent-demo.ts</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                   <div className="w-3 h-3 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 transition-colors" />
                   <div className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 transition-colors" />
                   <div className="w-3 h-3 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 transition-colors" />
                </div>
              </div>

              {/* Code Content */}
              <div className="p-4 overflow-x-auto bg-[#1e1e1e] font-mono text-sm leading-6">
                <pre className="text-[#d4d4d4]">
                  <code>
                    <span className="text-[#c586c0]">import</span> <span className="text-[#ffd700]">{`{ DevboxSDK }`}</span> <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">'@sealos/devbox-sdk'</span>
                    {"\n\n"}
                    <span className="text-[#6a9955]">// Initialize SDK</span>
                    {"\n"}
                    <span className="text-[#569cd6]">const</span> <span className="text-[#9cdcfe]">sdk</span> <span className="text-[#d4d4d4]">=</span> <span className="text-[#569cd6]">new</span> <span className="text-[#4ec9b0]">DevboxSDK</span><span className="text-[#ffd700]">({`{ kubeconfig }`})</span>
                    {"\n\n"}
                    <span className="text-[#6a9955]">// 1. Create Environment</span>
                    {"\n"}
                    <span className="text-[#569cd6]">const</span> <span className="text-[#9cdcfe]">devbox</span> <span className="text-[#d4d4d4]">=</span> <span className="text-[#c586c0]">await</span> <span className="text-[#9cdcfe]">sdk</span>.<span className="text-[#dcdcaa]">createDevbox</span><span className="text-[#ffd700]">({`{`}</span>
                    {"\n"}
                    <span className="text-[#9cdcfe]">  name:</span> <span className="text-[#ce9178]">'ai-agent-worker'</span>,
                    {"\n"}
                    <span className="text-[#9cdcfe]">  runtime:</span> <span className="text-[#ce9178]">'python:3.10'</span>,
                    {"\n"}
                    <span className="text-[#9cdcfe]">  resource:</span> <span className="text-[#ffd700]">{`{`}</span> <span className="text-[#9cdcfe]">cpu:</span> <span className="text-[#b5cea8]">2</span>, <span className="text-[#9cdcfe]">memory:</span> <span className="text-[#b5cea8]">4096</span> <span className="text-[#ffd700]">{`}`}</span>
                    {"\n"}
                    <span className="text-[#ffd700]">{`}`})</span>
                    {"\n\n"}
                    <span className="text-[#6a9955]">// 2. Execute AI Task</span>
                    {"\n"}
                    <span className="text-[#c586c0]">await</span> <span className="text-[#9cdcfe]">devbox</span>.<span className="text-[#dcdcaa]">codeRun</span><span className="text-[#ffd700]">(</span><span className="text-[#ce9178]">`</span>
                    {"\n"}
                    <span className="text-[#ce9178]">  from langchain.llms import OpenAI</span>
                    {"\n"}
                    <span className="text-[#ce9178]">  print("Agent Ready")</span>
                    {"\n"}
                    <span className="text-[#ce9178]">`</span><span className="text-[#ffd700]">)</span>
                  </code>
                </pre>
              </div>
              
              {/* VSCode Status Bar */}
               <div className="flex items-center justify-between px-3 py-1 bg-[#007acc] text-white text-[10px] font-sans">
                  <div className="flex items-center gap-3">
                     <div className="flex items-center gap-1"><GitBranch className="w-2.5 h-2.5" /> main*</div>
                     <div>0 errors, 0 warnings</div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div>Ln 12, Col 34</div>
                     <div>UTF-8</div>
                     <div>TypeScript React</div>
                     <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Prettier</div>
                  </div>
               </div>

              {/* Floating Badge */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-8 right-6 bg-[#1e1e1e]/90 backdrop-blur-md border border-[#333] shadow-lg px-3 py-2 rounded-md flex items-center gap-2 z-10"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-[#d4d4d4]">Running Agent...</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
