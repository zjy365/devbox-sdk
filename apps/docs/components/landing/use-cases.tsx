"use client"

import { SectionHeader } from "./section-header"
import { cn } from "@/lib/utils"
import { Bot, Code2, Rocket } from "lucide-react"

const cases = [
  {
    title: "AI Agents & Evals",
    description: "Provide secure, isolated sandboxes for AI agents to write and execute code without risking your infrastructure. Perfect for code interpretation and automated task execution.",
    icon: Bot,
    color: "text-black",
    bg: "bg-[#f5f5f5]",
  },
  {
    title: "Cloud IDE Backends",
    description: "Power your custom cloud IDEs with a robust backend that handles terminals, files, and language servers. Support for all major languages and runtimes out of the box.",
    icon: Code2,
    color: "text-black",
    bg: "bg-[#f5f5f5]",
  },
  {
    title: "CI/CD Pipelines",
    description: "Spin up ephemeral environments for testing and building applications in a clean state every time. Faster than traditional VMs and more secure than shared containers.",
    icon: Rocket,
    color: "text-black",
    bg: "bg-[#f5f5f5]",
  },
]

export function UseCases() {
  return (
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <SectionHeader 
          title="Built for Modern Workloads"
          description="From AI agents to production pipelines, Devbox SDK handles the most demanding infrastructure requirements."
        />
        
        <div className="grid md:grid-cols-3 gap-8">
          {cases.map((item) => (
            <div 
              key={item.title}
              className="group p-8 rounded-xl bg-white border border-[#e5e5e5] hover:border-[#d4d4d4] hover:shadow-lg hover:shadow-black/[0.02] transition-all duration-300"
            >
              <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-6 transition-colors border border-[#e5e5e5]", item.bg, item.color)}>
                <item.icon className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-black tracking-tight">{item.title}</h3>
              <p className="text-[#666] leading-relaxed font-normal text-[15px]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
