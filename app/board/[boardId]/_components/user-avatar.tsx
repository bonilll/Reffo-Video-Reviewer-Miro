import { Hint } from "@/components/hint";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  src?: string;
  name?: string;
  fallback?: string;
  borderColor?: string;
  size?: "sm" | "md";
  className?: string;
};

export const UserAvatar = ({
  src,
  name,
  fallback,
  borderColor,
  size = "md",
  className,
}: UserAvatarProps) => {
  const sizeClasses = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <Hint label={name || "Teammate"} side="bottom" sideOffset={18}>
      <Avatar className={cn("border-2", sizeClasses, className)} style={{ borderColor }}>
        <AvatarImage src={src} />
        <AvatarFallback className="text-xs font-semibold">
          {fallback}
        </AvatarFallback>
      </Avatar>
    </Hint>
  );
};
