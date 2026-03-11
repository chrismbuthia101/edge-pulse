"use client";

import React from "react";
import { motion, useScroll, useTransform, useInView, Variants } from "framer-motion";
import { Monitor, Shield, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const showcaseItems = [
  {
    title: "Command Dashboard",
    tagline: "Full situational awareness, at a glance",
    description:
      "A unified operations center that surfaces the alerts that matter, with full context and explainability — so your team can act fast without chasing noise.",
    icon: Monitor,
    features: [
      "Live threat feed with severity triage",
      "SHAP anomaly score breakdowns",
      "Device fleet management & health",
      "Customizable alert thresholds",
    ],
    accent: "text-primary",
    accentBg: "bg-primary/8",
    accentBorder: "border-primary/20",
    href: "/register",
  },
  {
    title: "Edge Intelligence",
    tagline: "Lightweight. Powerful. Offline-capable.",
    description:
      "Our 2MB agent runs full ML inference at the device level with no cloud round-trips. SHAP explainability is built into every prediction, and model updates deploy silently.",
    icon: Shield,
    features: [
      "SHAP feature contribution reports",
      "Automated model versioning & rollback",
      "Zero-config deployment via MDM",
      "Offline-first — works air-gapped",
    ],
    accent: "text-violet-600 dark:text-violet-400",
    accentBg: "bg-violet-500/8",
    accentBorder: "border-violet-500/20",
    href: "/register",
  },
];

const showcaseVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 40, opacity: 0, scale: 0.95 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function Showcase() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const headerParallaxY = useTransform(scrollYProgress, [0, 1], [30, -30]);
  const ctaBannerY = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const ctaTestimonialsY = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="py-24 bg-muted/30 border-y border-border relative overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header with parallax */}
        <motion.div
          style={{ y: headerParallaxY }}
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, type: "spring", stiffness: 300 }}
          className="max-w-2xl mb-20"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-3"
          >
            Platform Capabilities
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4 leading-tight"
          >
            Everything you need to protect the edge
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-muted-foreground text-base leading-relaxed"
          >
            EdgePulse is a complete edge security platform — from a powerful command dashboard to a
            featherweight device agent — designed to work seamlessly together.
          </motion.p>
        </motion.div>

        {/* Showcase items */}
        <motion.div
          variants={showcaseVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="space-y-20"
        >
          {showcaseItems.map((item, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className={`grid lg:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                }`}
            >
              {/* Visual mockup */}
              <motion.div
                className="relative"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
              >
                <motion.div
                  className="absolute inset-0 bg-primary/6 rounded-3xl blur-3xl scale-90 -z-10"
                  animate={{
                    scale: [0.9, 1, 0.9],
                    opacity: [0.6, 0.8, 0.6],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    delay: index * 0.5,
                  }}
                />
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/5 dark:shadow-black/25 group">
                  {/* Window bar */}
                  <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/50">
                    <div className="flex items-center gap-1.5">
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full bg-red-400/70"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full bg-yellow-400/70"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.2 }}
                      />
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full bg-green-400/70"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.4 }}
                      />
                    </div>
                    <div className="ml-2 flex-1 bg-background rounded border border-border px-2 py-0.5">
                      <span className="text-xs font-mono text-muted-foreground/60">
                        edgepulse / {item.title.toLowerCase().replace(" ", "-")}
                      </span>
                    </div>
                  </div>

                  {/* Placeholder content */}
                  <div
                    className={`aspect-video ${item.accentBg} flex flex-col items-center justify-center gap-4 p-8 relative overflow-hidden`}
                  >
                    <motion.div
                      className="absolute inset-0 opacity-10"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    />

                    <motion.div
                      className={`w-20 h-20 rounded-2xl ${item.accentBg} border ${item.accentBorder} flex items-center justify-center relative z-10 group-hover:scale-110 transition-transform duration-300`}
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.8, ease: "easeInOut" }}
                    >
                      <item.icon
                        className={`w-10 h-10 ${item.accent} group-hover:scale-110 transition-transform duration-300`}
                      />
                    </motion.div>
                    <div className="text-center relative z-10">
                      <motion.p
                        className={`text-sm font-semibold ${item.accent}`}
                        whileHover={{ y: -2 }}
                      >
                        {item.title}
                      </motion.p>
                      <p className="text-xs text-muted-foreground mt-1">{item.tagline}</p>
                    </div>

                    <div className="w-full max-w-xs space-y-2 mt-2 relative z-10">
                      {[85, 60, 75, 45].map((w, i) => (
                        <motion.div
                          key={i}
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{
                            delay: 0.3 + i * 0.1,
                            duration: 0.5,
                            ease: "easeOut",
                          }}
                          style={{ originX: 0 }}
                          className="h-1.5 bg-border rounded-full overflow-hidden relative"
                        >
                          <motion.div
                            className={`h-full rounded-full ${index === 0 ? "bg-primary/50" : "bg-violet-500/50"
                              } relative`}
                            style={{ width: `${w}%` }}
                          >
                            <motion.div
                              className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
                              animate={{ x: [-100, 200] }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                delay: i * 0.2,
                              }}
                            />
                          </motion.div>
                        </motion.div>
                      ))}
                    </div>

                    <motion.span
                      className="text-xs font-mono text-muted-foreground/50 uppercase tracking-widest relative z-10"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      Interactive Preview
                    </motion.span>
                  </div>
                </div>
              </motion.div>

              {/* Copy */}
              <motion.div className="space-y-6">
                <motion.div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${item.accentBorder} ${item.accentBg}`}
                  whileHover={{ rotate: [0, 2, -2, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  >
                    <item.icon className={`h-3.5 w-3.5 ${item.accent}`} />
                  </motion.div>
                  <span className={`text-xs font-semibold ${item.accent}`}>{item.title}</span>
                </motion.div>

                <motion.h3
                  className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3 leading-tight"
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                >
                  {item.tagline}
                </motion.h3>
                <motion.p
                  className="text-muted-foreground leading-relaxed mb-6 text-base"
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                >
                  {item.description}
                </motion.p>

                <motion.ul
                  className="space-y-3 mb-8"
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.4 }}
                >
                  {item.features.map((f, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{
                        delay: 0.7 + index * 0.1 + i * 0.08,
                        duration: 0.4,
                      }}
                      className="flex items-start gap-2.5 text-sm text-foreground group"
                    >
                      <motion.div
                        whileHover={{ rotate: 360, scale: 1.2 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                      >
                        <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${item.accent}`} />
                      </motion.div>
                      <motion.span className="group-hover:translate-x-1 transition-transform duration-200">
                        {f}
                      </motion.span>
                    </motion.li>
                  ))}
                </motion.ul>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.4 }}
                >
                  <Button variant="outline" className="gap-2 group" asChild>
                    <Link href={item.href}>
                      Explore {item.title}
                      <motion.div
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </motion.div>
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA banner */}
        <motion.div
          style={{ y: ctaBannerY }}
          initial={{ opacity: 0, y: 32 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, type: "spring", stiffness: 300 }}
          className="mt-24 relative overflow-hidden bg-card border border-border rounded-3xl p-10 md:p-14 text-center group"
          whileHover={{ scale: 1.02 }}
        >
          <motion.div
            className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none"
            animate={{
              opacity: [0.6, 1, 0.6],
            }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-linear-to-b from-primary/20 via-transparent to-transparent pointer-events-none"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="inline-block text-xs font-semibold uppercase tracking-widest text-primary"
            >
              Get Started Today
            </motion.span>
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl md:text-3xl font-display font-bold text-foreground"
            >
              Ready to secure your edge?
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-muted-foreground leading-relaxed"
            >
              Join thousands of organizations trusting EdgePulse for intelligent, explainable,
              privacy-first edge security. No cloud required.
            </motion.p>
            <motion.div
              style={{ y: ctaTestimonialsY }}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button size="lg" className="gap-2 shadow-lg shadow-primary/15 group" asChild>
                  <Link href="/auth/register">
                    Start Free Trial
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2, type: "spring", stiffness: 400 }}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </motion.div>
                  </Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/auth/login">Schedule Demo</Link>
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}