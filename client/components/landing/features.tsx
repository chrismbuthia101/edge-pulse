"use client";

import { motion, Variants } from "framer-motion";
import { Shield, Zap, Brain, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "Real-time Defense",
    description: "Advanced ML algorithms detect and neutralize threats in milliseconds.",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    icon: Brain,
    title: "Explainable AI",
    description: "SHAP-powered insights provide complete transparency for every decision.",
    gradient: "from-purple-500 to-pink-600",
  },
  {
    icon: Zap,
    title: "Edge Native",
    description: "Ultra-lightweight agents with zero cloud dependency and minimal footprint.",
    gradient: "from-yellow-500 to-orange-600",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description: "Your sensitive data never leaves your infrastructure - ever.",
    gradient: "from-green-500 to-emerald-600",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 30, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, type: "spring" as const },
  },
};

export function Features() {
  return (
    <section id="features" className="py-16 bg-linear-to-b from-slate-900/50 to-slate-800/30">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="bg-linear-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              Next-Gen Security Features
            </span>
          </h2>
          <p className="text-xl text-cyan-100/80 max-w-3xl mx-auto leading-relaxed">
            Cutting-edge technology designed for the modern enterprise threat landscape.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={itemVariants}>
              <Card className="group relative overflow-hidden border-0 bg-linear-to-br from-white/10 to-white/5 backdrop-blur-xl hover:from-white/15 hover:to-white/10 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20 rounded-2xl h-64">
                {/* Gradient Overlay */}
                <div className={`absolute inset-0 bg-linear-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />

                {/* Content */}
                <CardContent className="relative h-full p-6 flex flex-col justify-between">
                  <div>
                    <motion.div
                      className="w-16 h-16 bg-linear-to-br from-white/20 to-white/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300"
                      whileHover={{ rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <feature.icon className="w-8 h-8 text-white" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-cyan-200 transition-colors duration-300">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-cyan-100/70 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>

                {/* Animated Border */}
                <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-cyan-500/50 to-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
