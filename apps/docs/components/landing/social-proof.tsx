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
    <section className="border-y bg-muted/30">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col gap-2"
            >
              <div className="text-3xl md:text-4xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

