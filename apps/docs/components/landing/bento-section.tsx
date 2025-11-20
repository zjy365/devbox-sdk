'use client'

import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Terminal,
  Cpu,
  Globe,
  HardDrive,
  GitBranch,
  Activity,
  Zap,
  Shield,
  Box,
} from 'lucide-react'
import { SectionHeader } from './section-header'
import { cn } from '@/lib/utils'

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
      whileHover={{ scale: 1.02 }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-background/50 p-6 md:p-8 backdrop-blur-xl transition-colors hover:bg-muted/50 hover:border-primary/20',
        className
      )}
    >
      <div className="flex flex-col gap-4 relative z-10 h-full">
        <div className="p-3 rounded-xl bg-primary/10 w-fit text-primary group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">{title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        </div>
        {children && <div className="mt-auto pt-4">{children}</div>}
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </motion.div>
  )
}

export function BentoSection() {
  return (
    <section className="py-20 md:py-32 px-4 md:px-6 container mx-auto">
      <SectionHeader
        title="Full Control Over Cloud Environments"
        description="Everything you need to build powerful cloud development tools and infrastructure with a single SDK."
      />

      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-6 gap-4 md:gap-6 auto-rows-[minmax(180px,auto)]">
        {/* Large Card - Lifecycle */}
        <BentoCard
          className="md:col-span-4 bg-gradient-to-br from-background to-muted/30"
          title="Instant Lifecycle Management"
          description="Create, pause, resume, and destroy environments in seconds. Programmatically manage CPU and Memory resources with granular control."
          icon={<Zap className="h-6 w-6" />}
        >
          <div className="mt-4 flex items-center gap-2 overflow-hidden opacity-60">
            <div className="h-1.5 w-12 rounded-full bg-green-500/50" />
            <div className="h-1.5 w-8 rounded-full bg-yellow-500/50" />
            <div className="h-1.5 w-16 rounded-full bg-blue-500/50" />
          </div>
        </BentoCard>

        {/* Medium Card - Files */}
        <BentoCard
          className="md:col-span-2"
          title="File System Control"
          description="Upload, download, watch, and manage files with high-performance transfer methods."
          icon={<HardDrive className="h-6 w-6" />}
        />

        {/* Medium Card - Process */}
        <BentoCard
          className="md:col-span-2"
          title="Process Management"
          description="Execute commands, stream logs, and manage background processes with ease."
          icon={<Terminal className="h-6 w-6" />}
        />

        {/* Large Card - Git */}
        <BentoCard
          className="md:col-span-4"
          title="Git Integration"
          description="Clone, pull, push, and manage branches directly within the remote environment. Native support for authentication and complex workflows."
          icon={<GitBranch className="h-6 w-6" />}
        >
          <div className="flex gap-2 mt-2 opacity-40 text-xs font-mono">
            <span className="text-orange-500">git</span> clone repo...
          </div>
        </BentoCard>

        {/* Small Cards */}
        <BentoCard
          className="md:col-span-2"
          title="Network & Ports"
          description="Expose ports, manage domains, and handle secure networking automatically."
          icon={<Globe className="h-6 w-6" />}
        />

        <BentoCard
          className="md:col-span-2"
          title="Real-time Monitoring"
          description="Track CPU, memory, disk, and network usage with built-in metrics."
          icon={<Activity className="h-6 w-6" />}
        />

        <BentoCard
          className="md:col-span-2"
          title="Secure Isolation"
          description="Container-level isolation for untrusted code execution."
          icon={<Shield className="h-6 w-6" />}
        />
      </div>
    </section>
  )
}
