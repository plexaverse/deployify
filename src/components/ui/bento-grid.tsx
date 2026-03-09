'use client';

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
        "grid md:auto-rows-[20rem] grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto",
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
        "row-span-1 rounded-3xl group/bento hover:shadow-xl transition duration-200 shadow-[var(--shadow-sm)] p-6 bg-[var(--card)]/50 border border-[var(--border)] backdrop-blur-md justify-between flex flex-col space-y-4",
        className
      )}
    >
      {header}
      {(icon || title || description) && (
        <div>
          {icon && <div className="mb-2 transition-transform duration-200">{icon}</div>}
          {title && (
            <div className="font-sans font-bold text-[var(--foreground)] mb-2 mt-2">
              {title}
            </div>
          )}
          {description && (
            <div className="font-sans font-normal text-[var(--muted-foreground)] text-xs">
              {description}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
