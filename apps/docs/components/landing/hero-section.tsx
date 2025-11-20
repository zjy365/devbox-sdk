"use client"

import Link from "next/link"
import { ArrowRight, Github, Terminal, GitBranch } from "lucide-react"
import { motion } from "motion/react"

export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden pt-32 pb-20 md:pt-48 md:pb-32 bg-white">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
          {/* Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="inline-flex items-center rounded-full border border-[#e5e5e5] bg-white px-3 py-1 text-xs font-medium text-[#666]">
              v1.0.0 Enterprise Ready
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="space-y-6"
          >
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-black">
              Programmatic Cloud <br />
              <span className="text-[#666]">Development</span>
            </h1>
            <p className="text-xl text-[#666] max-w-2xl mx-auto leading-relaxed font-normal">
              The enterprise TypeScript SDK for Sealos Devbox. 
              Spin up, manage, and control isolated cloud environments with precision.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-md text-base font-medium transition-all bg-black text-white hover:bg-[#333] h-12 px-8 shadow-lg shadow-black/5"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="https://github.com/zjy365/devbox-sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-base font-medium transition-all border border-[#e5e5e5] bg-white text-black hover:bg-[#f5f5f5] h-12 px-8"
            >
              <Github className="mr-2 h-4 w-4" />
              View on GitHub
            </a>
          </motion.div>

          {/* Code Window - Dark Mode Contrast */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl mt-16"
          >
            <div className="relative rounded-xl bg-[#0a0a0a] shadow-2xl border border-[#333] overflow-hidden ring-1 ring-black/5">
              {/* Window Controls */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-[#333]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#333]" />
                    <div className="w-3 h-3 rounded-full bg-[#333]" />
                    <div className="w-3 h-3 rounded-full bg-[#333]" />
                  </div>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-50">
                  <Terminal className="w-3.5 h-3.5 text-[#888]" />
                  <span className="text-xs font-medium font-sans text-[#888]">agent-demo.ts</span>
                </div>
              </div>

              {/* Code Area */}
              <div className="p-6 text-left overflow-x-auto bg-[#0a0a0a]">
                <pre className="font-mono text-sm leading-relaxed text-[#e5e5e5]">
                  <code>
                    <span className="text-[#ff79c6]">import</span> <span className="text-[#f8f8f2]">{'{ DevboxSDK }'}</span> <span className="text-[#ff79c6]">from</span> <span className="text-[#f1fa8c]">'@sealos/devbox-sdk'</span>
                    {"\n\n"}
                    <span className="text-[#6272a4]">{'// Initialize SDK'}</span>
                    {"\n"}
                    <span className="text-[#8be9fd]">const</span> <span className="text-[#f8f8f2]">sdk</span> <span className="text-[#ff79c6]">=</span> <span className="text-[#ff79c6]">new</span> <span className="text-[#50fa7b]">DevboxSDK</span><span className="text-[#f8f8f2]">{'({ kubeconfig })'}</span>
                    {"\n\n"}
                    <span className="text-[#6272a4]">{'// 1. Create Environment'}</span>
                    {"\n"}
                    <span className="text-[#8be9fd]">const</span> <span className="text-[#f8f8f2]">devbox</span> <span className="text-[#ff79c6]">=</span> <span className="text-[#ff79c6]">await</span> <span className="text-[#f8f8f2]">sdk</span>.<span className="text-[#50fa7b]">createDevbox</span><span className="text-[#f8f8f2]">{'({'}</span>
                    {"\n"}
                    <span className="text-[#f8f8f2]">  name:</span> <span className="text-[#f1fa8c]">'ai-agent-worker'</span>,
                    {"\n"}
                    <span className="text-[#f8f8f2]">  runtime:</span> <span className="text-[#f1fa8c]">'python:3.10'</span>,
                    {"\n"}
                    <span className="text-[#f8f8f2]">  resource:</span> <span className="text-[#f8f8f2]">{'{ '}</span><span className="text-[#f8f8f2]">cpu:</span> <span className="text-[#bd93f9]">2</span>, <span className="text-[#f8f8f2]">memory:</span> <span className="text-[#bd93f9]">4096</span> <span className="text-[#f8f8f2]">{' }'}</span>
                    {"\n"}
                    <span className="text-[#f8f8f2]">{'}'}</span>)
                    {"\n\n"}
                    <span className="text-[#6272a4]">{'// 2. Execute AI Task'}</span>
                    {"\n"}
                    <span className="text-[#ff79c6]">await</span> <span className="text-[#f8f8f2]">devbox</span>.<span className="text-[#50fa7b]">codeRun</span><span className="text-[#f8f8f2]">(</span><span className="text-[#f1fa8c]">{'`'}</span>
                    {"\n"}
                    <span className="text-[#f1fa8c]">  from langchain.llms import OpenAI</span>
                    {"\n"}
                    <span className="text-[#f1fa8c]">  print("Agent Ready")</span>
                    {"\n"}
                    <span className="text-[#f1fa8c]">{'`'}</span><span className="text-[#f8f8f2]">)</span>
                  </code>
                </pre>
              </div>

              {/* Status Bar */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] border-t border-[#333] text-[11px] font-medium text-[#666]">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 hover:text-[#999] transition-colors">
                    <GitBranch className="w-3 h-3" /> main*
                  </div>
                  <div className="hover:text-[#999] transition-colors">0 errors</div>
                </div>
                <div className="flex items-center gap-4">
                   <div>TypeScript</div>
                   <div className="flex items-center gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Online
                   </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
