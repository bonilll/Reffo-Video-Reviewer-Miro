"use client";

interface TodoButtonProps {
  boardId?: string;
  size?: "sm" | "md" | "lg";
  onCreateWidget?: () => void;
  onHover?: (label: string) => void;
  onHoverEnd?: () => void;
}

export const TodoButton = (_props: TodoButtonProps) => {
  return null;
};

export default TodoButton;
