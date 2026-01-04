'use client'

import { cn } from '@/lib/utils'
import {
  Activity,
  Box,
  Cpu,
  GitBranch,
  Globe,
  HardDrive,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { SectionHeader } from './section-header'

interface BentoCardProps {
  title: string
  description: string
  icon: ReactNode
  className?: string
  children?: ReactNode
}

function BentoCard({ title, description, icon, className, children }: BentoCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-[#e5e5e5] bg-white p-6 transition-all hover:shadow-lg hover:shadow-black/[0.02] hover:border-[#d4d4d4]',
        className
      )}
    >
      <div className="flex flex-col gap-4 relative z-10 h-full">
        <div className="p-2.5 rounded-lg bg-[#fafafa] w-fit text-black border border-[#e5e5e5] shadow-sm">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2 text-black tracking-tight">{title}</h3>
          <p className="text-[#666] text-sm leading-relaxed">{description}</p>
        </div>
        {children && <div className="mt-auto pt-6">{children}</div>}
      </div>
    </motion.div>
  )
}

export function BentoSection() {
  return (
    <section className="py-32 px-4 md:px-6 container mx-auto bg-[#fafafa]/50">
      <SectionHeader
        title="Full Control Over Cloud Environments"
        description="Everything you need to build powerful cloud development tools and infrastructure with a single SDK."
      />

      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-6 gap-6 auto-rows-[minmax(200px,auto)]">
        {/* Large Card - Lifecycle */}
        <BentoCard
          className="md:col-span-4"
          title="Instant Lifecycle Management"
          description="Create, pause, resume, and destroy environments in seconds. Programmatically manage CPU and Memory resources with granular control."
          icon={<Zap className="h-5 w-5 stroke-[1.5]" />}
        >
          <div className="mt-4 flex items-center gap-3 overflow-hidden opacity-60 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500">
            <div className="h-2 w-16 rounded-full bg-green-500" />
            <div className="h-2 w-10 rounded-full bg-yellow-500" />
            <div className="h-2 w-20 rounded-full bg-blue-500" />
          </div>
        </BentoCard>

        {/* Medium Card - Files */}
        <BentoCard
          className="md:col-span-2"
          title="File System Control"
          description="Upload, download, watch, and manage files with high-performance transfer methods."
          icon={<HardDrive className="h-5 w-5 stroke-[1.5]" />}
        />

        {/* Medium Card - Process */}
        <BentoCard
          className="md:col-span-2"
          title="Process Management"
          description="Execute commands, stream logs, and manage background processes with ease."
          icon={<Terminal className="h-5 w-5 stroke-[1.5]" />}
        />

        {/* Large Card - Git */}
        <BentoCard
          className="md:col-span-4"
          title="Git Integration"
          description="Clone, pull, push, and manage branches directly within the remote environment. Native support for authentication and complex workflows."
          icon={<GitBranch className="h-5 w-5 stroke-[1.5]" />}
        >
          <div className="flex gap-2 mt-2 opacity-60 text-xs font-mono bg-[#fafafa] p-2 rounded border border-[#e5e5e5] w-fit group-hover:border-[#d4d4d4] transition-colors">
            <span className="text-[#666]">$</span>
            <span className="text-black font-medium">git</span>
            <span className="text-[#666]">clone https://github.com/...</span>
          </div>
        </BentoCard>

        {/* Small Cards */}
        <BentoCard
          className="md:col-span-2"
          title="Network & Ports"
          description="Expose ports, manage domains, and handle secure networking automatically."
          icon={<Globe className="h-5 w-5 stroke-[1.5]" />}
        />

        <BentoCard
          className="md:col-span-2"
          title="Real-time Monitoring"
          description="Track CPU, memory, disk, and network usage with built-in metrics."
          icon={<Activity className="h-5 w-5 stroke-[1.5]" />}
        />

        <BentoCard
          className="md:col-span-2"
          title="Secure Isolation"
          description="Container-level isolation for untrusted code execution."
          icon={<Shield className="h-5 w-5 stroke-[1.5]" />}
        />
      </div>
    </section>
  )
}
