"use client"

import { motion } from "motion/react"

const stats = [
  { label: "Runtime Startup", value: "< 500ms" },
  { label: "Uptime SLA", value: "99.9%" },
  { label: "Global Regions", value: "12+" },
  { label: "API Latency", value: "< 50ms" },
]

export function SocialProof() {
  return (
    <section className="border-y border-[#e5e5e5] bg-[#fafafa]">
      <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5, ease: "easeOut" }}
              className="flex flex-col gap-2"
            >
              <div className="text-4xl md:text-5xl font-bold text-black tracking-tight">
                {stat.value}
              </div>
              <div className="text-xs text-[#666] font-semibold uppercase tracking-[0.1em]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
