"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Menu, X, Github } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navItems = [
    { name: "Documentation", href: "/docs" },
    { name: "API Reference", href: "/docs/api" },
    { name: "Examples", href: "https://github.com/zjy365/devbox-sdk/tree/main/examples" },
  ]

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-200 ease-in-out",
          isScrolled 
            ? "bg-white/80 backdrop-blur-md border-b border-black/[0.03] py-4" 
            : "bg-white py-6"
        )}
      >
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 z-50 group">
            <span className="text-xl font-bold tracking-tight text-black group-hover:opacity-80 transition-opacity">
              Devbox SDK
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm text-[#666] hover:text-black transition-colors duration-200"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="https://github.com/zjy365/devbox-sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#666] hover:text-black transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded text-sm font-medium transition-all bg-black text-white hover:bg-[#333] px-4 py-2 h-9"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="md:hidden z-50 p-2 text-[#666] hover:text-black transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-white pt-24 px-6 md:hidden"
          >
            <nav className="flex flex-col gap-6">
              {navItems.map((item, i) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05 }}
                >
                  <Link
                    href={item.href}
                    className="text-lg font-medium text-[#666] hover:text-black block py-2 border-b border-black/[0.05]"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col gap-4 mt-6"
              >
                <Link
                  href="/docs"
                  className="w-full inline-flex items-center justify-center rounded-md text-base font-medium bg-black text-white py-3 hover:bg-[#333] transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
                <a
                  href="https://github.com/zjy365/devbox-sdk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center rounded-md text-base font-medium bg-[#f5f5f5] text-black py-3 gap-2 hover:bg-[#eaeaea] transition-colors"
                >
                  <Github className="w-5 h-5" />
                  View on GitHub
                </a>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
