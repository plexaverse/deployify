"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const BEAMS = [
  { left: '10%', duration: 12, delay: 0 },
  { left: '25%', duration: 15, delay: 2 },
  { left: '45%', duration: 18, delay: 4 },
  { left: '60%', duration: 14, delay: 1 },
  { left: '75%', duration: 16, delay: 3 },
  { left: '90%', duration: 20, delay: 5 },
];

export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 z-0 h-full w-full overflow-hidden [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] hidden md:block",
        className
      )}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle, #333 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />
      <div className="absolute inset-0 overflow-hidden">
        {BEAMS.map((beam, i) => (
          <motion.div
            key={i}
            initial={{ top: "-20%", left: beam.left, opacity: 0 }}
            animate={{
              top: "120%",
              opacity: [0, 0.3, 0],
            }}
            transition={{
              duration: beam.duration,
              repeat: Infinity,
              ease: "linear",
              delay: beam.delay,
            }}
            className="absolute w-[1px] h-60 bg-gradient-to-b from-transparent via-indigo-500/50 to-transparent"
          />
        ))}
      </div>
    </div>
  );
};
