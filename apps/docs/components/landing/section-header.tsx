import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  description?: string
  className?: string
  align?: "left" | "center" | "right"
}

export function SectionHeader({ 
  title, 
  description, 
  className, 
  align = "center" 
}: SectionHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-4 mb-12 md:mb-16",
      {
        "items-start text-left": align === "left",
        "items-center text-center": align === "center",
        "items-end text-right": align === "right",
      },
      className
    )}>
      <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
        {title}
      </h2>
      {description && (
        <p className="text-muted-foreground text-lg md:text-xl font-medium leading-relaxed max-w-3xl">
          {description}
        </p>
      )}
    </div>
  )
}

