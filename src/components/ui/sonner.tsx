import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { LoadingMark } from "./LoadingMark"

const Toaster = ({ theme: providedTheme, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const resolvedTheme: NonNullable<ToasterProps["theme"]> =
    providedTheme === "light" || providedTheme === "dark" || providedTheme === "system"
      ? providedTheme
      : theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : "system"

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <LoadingMark size="md" className="bg-gray-300" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
