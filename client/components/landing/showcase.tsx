"use client";

import { motion } from "framer-motion";
import { Monitor, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const showcaseItems = [
  {
    title: "Command Dashboard",
    description: "Real-time monitoring with intuitive threat detection interface.",
    icon: Monitor,
    features: ["Live Threat Feed", "Anomaly Scoring", "Device Management"],
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    title: "Edge Intelligence",
    description: "Lightweight agents with advanced ML and explainable AI.",
    icon: Shield,
    features: ["SHAP Explanations", "Model Versioning", "Zero Config"],
    gradient: "from-purple-500 to-pink-600",
  },
];

export function Showcase() {
  return (
    <section className="py-16 bg-linear-to-b from-slate-900/50 to-slate-800/30">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="bg-linear-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              Platform Capabilities
            </span>
          </h2>
          <p className="text-xl text-cyan-100/80 max-w-3xl mx-auto leading-relaxed">
            Experience the power of intelligent edge security.
          </p>
        </motion.div>

        <div className="space-y-24">
          {showcaseItems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.3 }}
              className={`grid lg:grid-cols-2 gap-12 items-center ${
                index % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className={index % 2 === 1 ? "lg:pl-12" : "lg:pr-12"}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.3 + 0.2 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <Card className="overflow-hidden border-0 bg-linear-to-br from-white/10 to-white/5 backdrop-blur-xl hover:from-white/15 hover:to-white/10 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/20 rounded-2xl">
                    <div className="aspect-video bg-linear-to-br from-slate-800/50 to-slate-900/50 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ 
                            scale: [1, 1.1, 1],
                            rotate: [0, 2, -2, 0]
                          }}
                          transition={{ 
                            duration: 4, 
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        >
                          <item.icon className="w-24 h-24 text-cyan-400/50" />
                        </motion.div>
                      </div>
                      <div className="absolute inset-0 bg-linear-to-t from-slate-900/50 to-transparent" />
                      <motion.div 
                        className="absolute bottom-4 left-4 text-sm text-cyan-300 font-mono"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        INTERACTIVE PREVIEW
                      </motion.div>
                    </div>
                  </Card>
                </motion.div>
              </div>

              <div className={index % 2 === 1 ? "lg:pr-12" : "lg:pl-12"}>
                <motion.div
                  initial={{ opacity: 0, x: index % 2 === 1 ? 30 : -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.3 + 0.4 }}
                >
                  <div className="flex items-center gap-4 mb-6">
                    <motion.div 
                      className={`w-16 h-16 bg-linear-to-br ${item.gradient} rounded-2xl flex items-center justify-center`}
                      whileHover={{ rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <item.icon className="w-8 h-8 text-white" />
                    </motion.div>
                    <h3 className="text-3xl font-bold text-white">{item.title}</h3>
                  </div>
                  
                  <p className="text-xl text-cyan-100/80 mb-8 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="space-y-4 mb-8">
                    {item.features.map((feature, featureIndex) => (
                      <motion.div
                        key={featureIndex}
                        initial={{ opacity: 0, x: -15 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.3 + 0.6 + featureIndex * 0.1 }}
                        whileHover={{ x: 5 }}
                        className="flex items-center gap-4 group"
                      >
                        <motion.div 
                          className="w-3 h-3 bg-linear-to-r from-cyan-400 to-blue-400 rounded-full"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ 
                            duration: 2, 
                            repeat: Infinity,
                            delay: featureIndex * 0.2
                          }}
                        />
                        <span className="text-cyan-200 group-hover:text-white transition-colors duration-300">
                          {feature}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button size="lg" className="bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 shadow-2xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 group">
                      Explore Features
                      <motion.span
                        className="inline-block ml-3"
                        whileHover={{ x: 6 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        →
                      </motion.span>
                    </Button>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Streamlined CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 text-center"
        >
          <Card className="p-12 border-0 bg-linear-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl hover:from-cyan-500/15 hover:to-blue-500/15 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/20 rounded-2xl">
            <h3 className="text-3xl font-bold text-white mb-6">
              Ready to Secure Your Edge?
            </h3>
            <p className="text-xl text-cyan-100/80 mb-8 max-w-2xl mx-auto leading-relaxed">
              Join thousands of organizations trusting EdgePulse for intelligent security.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button size="lg" className="bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 shadow-2xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 text-lg px-10 py-8">
                  Start Free Trial
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="outline" size="lg" className="border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400 hover:text-cyan-200 shadow-xl shadow-cyan-500/10 transition-all duration-300 text-lg px-10 py-8">
                  Schedule Demo
                </Button>
              </motion.div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
