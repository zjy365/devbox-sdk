"use client"

import { SectionHeader } from "./section-header"
import { cn } from "@/lib/utils"
import { Bot, Code2, Rocket } from "lucide-react"

const cases = [
  {
    title: "AI Agents & Evals",
    description: "Provide secure, isolated sandboxes for AI agents to write and execute code without risking your infrastructure. Perfect for code interpretation and automated task execution.",
    icon: Bot,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "Cloud IDE Backends",
    description: "Power your custom cloud IDEs with a robust backend that handles terminals, files, and language servers. Support for all major languages and runtimes out of the box.",
    icon: Code2,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    title: "CI/CD Pipelines",
    description: "Spin up ephemeral environments for testing and building applications in a clean state every time. Faster than traditional VMs and more secure than shared containers.",
    icon: Rocket,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
]

export function UseCases() {
  return (
    <section className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4 md:px-6">
        <SectionHeader 
          title="Built for Modern Workloads"
          description="From AI agents to production pipelines, Devbox SDK handles the most demanding infrastructure requirements."
        />
        
        <div className="grid md:grid-cols-3 gap-8">
          {cases.map((item) => (
            <div 
              key={item.title}
              className="group p-8 rounded-2xl bg-background border hover:border-primary/20 transition-all hover:shadow-lg"
            >
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-colors", item.bg, item.color)}>
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

