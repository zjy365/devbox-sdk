'use client'

import { cn } from '@/lib/utils'
import { type HTMLMotionProps, motion } from 'motion/react'
import type { ReactNode } from 'react'

interface AnimatedSectionProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  delay?: number
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
  ...props
}: AnimatedSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1], delay }}
      className={cn('w-full', className)}
      {...props}
    >
      {children}
    </motion.div>
  )
}
