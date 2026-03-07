"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Users, Star } from "lucide-react";
import { Card } from "@/components/ui/card";

const trustMetrics = [
  {
    icon: Users,
    value: "10K+",
    label: "Devices Protected",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    icon: ShieldCheck,
    value: "99.9%",
    label: "Detection Accuracy",
    gradient: "from-purple-500 to-pink-600",
  },
  {
    icon: Star,
    value: "4.9/5",
    label: "User Rating",
    gradient: "from-yellow-500 to-orange-600",
  },
];

const testimonials = [
  {
    quote: "EdgePulse transformed our security posture with real-time edge detection.",
    author: "Sarah Chen",
    role: "CISO, TechCorp",
  },
];

export function Trust() {
  return (
    <section className="py-16 bg-linear-to-b from-slate-800/30 to-slate-900/50">
      <div className="max-w-6xl mx-auto px-6">
        {/* Trust Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="bg-linear-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              Trusted by Industry Leaders
            </span>
          </h2>
          <p className="text-xl text-cyan-100/80 max-w-3xl mx-auto leading-relaxed">
            Join thousands of organizations relying on EdgePulse for enterprise security.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {trustMetrics.map((metric, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              whileHover={{ scale: 1.05, y: -8 }}
              className="group"
            >
              <Card className="text-center p-8 border-0 bg-linear-to-br from-white/10 to-white/5 backdrop-blur-xl hover:from-white/15 hover:to-white/10 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/20 rounded-2xl">
                <motion.div 
                  className={`w-16 h-16 bg-linear-to-br ${metric.gradient} rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300`}
                  whileHover={{ rotate: [0, -5, 5, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <metric.icon className="w-8 h-8 text-white" />
                </motion.div>
                <div className="text-4xl font-bold text-white mb-2">{metric.value}</div>
                <div className="text-lg font-semibold text-cyan-200">{metric.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Single Testimonial */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto"
        >
          <Card className="p-8 border-0 bg-linear-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl hover:from-cyan-500/15 hover:to-blue-500/15 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/20 rounded-2xl">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 bg-linear-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <blockquote className="text-xl text-cyan-100/90 italic leading-relaxed mb-6">
                  &ldquo;{testimonials[0].quote}&rdquo;
                </blockquote>
                <div className="font-semibold text-white">{testimonials[0].author}</div>
                <div className="text-cyan-300">{testimonials[0].role}</div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
