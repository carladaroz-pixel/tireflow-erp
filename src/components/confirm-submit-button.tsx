"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  className,
  message,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  message: string;
  name?: string;
  value?: string;
}) {
  return (
    <button
      className={className}
      name={name}
      value={value}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
