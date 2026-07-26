"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { createContext, forwardRef, useContext } from "react";
import { motion } from "motion/react";

import { collapseVariants, motionPressTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CollapsibleOpenContext = createContext(false);

function Collapsible({ render: _render, ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      {...props}
      render={(elementProps, state) => (
        <CollapsibleOpenContext.Provider value={state.open}>
          <div {...elementProps} />
        </CollapsibleOpenContext.Provider>
      )}
    />
  );
}

function useCollapsibleOpen() {
  return useContext(CollapsibleOpenContext);
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      className={className}
      render={(elementProps, state) => (
        <motion.button
          {...elementProps}
          animate={{ scale: state.open ? 1.005 : 1 }}
          transition={motionPressTransition}
        />
      )}
      {...props}
    />
  );
}

const CollapsibleContent = forwardRef<HTMLDivElement, CollapsiblePrimitive.Panel.Props>(
  ({ className, ...props }, ref) => (
    <CollapsiblePrimitive.Panel
      {...props}
      ref={ref}
      keepMounted
      className={cn("overflow-hidden", className)}
      render={(elementProps, state) => (
        <motion.div
          {...elementProps}
          hidden={false}
          inert={!state.open}
          initial="closed"
          animate={state.open ? "open" : "closed"}
          variants={collapseVariants}
        />
      )}
    />
  ),
);
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent, useCollapsibleOpen };
