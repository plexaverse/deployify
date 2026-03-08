"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={cn(
        "row-span-1 rounded-3xl group/bento hover:shadow-xl transition-all duration-300 shadow-[var(--shadow-sm)] p-6 bg-[var(--card)] border border-[var(--border)] hover:border-[var(--foreground)]/30 justify-between flex flex-col space-y-4",
        className
      )}
    >
      {header}
      <div className="transition duration-200">
        {icon}
        <div className="font-sans font-bold text-[var(--foreground)] mb-2 mt-2">
          {title}
        </div>
        <div className="font-sans font-normal text-[var(--muted-foreground)] text-xs">
          {description}
        </div>
      </div>
    </motion.div>
  );
};
