import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

/**
 * Real GitHub Octocat logo.
 * Source: https://github.com/logos
 */
export function GitHubIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-5 w-5", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/**
 * Real Notion logo.
 * Source: https://notion.so/brand
 */
export function NotionIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-5 w-5", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.29 2.29c-.42-.326-.98-.7-2.055-.607L3.16 2.87c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.747-.886l-15.177.887c-.56.047-.748.327-.748.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.513.28-.886.747-.933zM2.788 1.136l13.59-1c1.635-.14 2.055-.047 3.08.7l4.25 2.986c.7.513.933.653.933 1.213v16.378c0 1.026-.373 1.632-1.68 1.726l-15.458.933c-.98.047-1.448-.093-1.962-.747l-3.127-4.066c-.56-.747-.793-1.306-.793-1.96V2.762c0-.838.374-1.54 1.167-1.626z" />
    </svg>
  );
}

/**
 * Real Slack logo (hash/pound mark style).
 * Source: https://slack.com/media-kit
 */
export function SlackIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-5 w-5", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        fill="#E01E5A"
      />
      <path
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        fill="#36C5F0"
      />
      <path
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        fill="#2EB67D"
      />
      <path
        d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        fill="#ECB22E"
      />
    </svg>
  );
}

/**
 * Real Linear logo mark.
 * Source: https://linear.app — the distinctive arc/swoosh mark.
 */
export function LinearIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("h-5 w-5", className)}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.22541 61.5228c-.18784-.2709-.04364-.6451.27127-.6938 6.30851-.9744 12.7838-1.1879 19.1358.0638C33.6262 63.438 44.5765 72.1106 50.5765 84.2517c1.1252 2.2788 2.0418 4.6521 2.7358 7.0952.0826.2909-.1634.5689-.4645.5311-1.3563-.1702-2.7058-.3968-4.0453-.6795C25.8504 86.8613 7.39662 76.898 1.22541 61.5228zM.0091 49.1585C-.11726 48.849.12675 48.52.45332 48.5765c2.50976.4339 4.97866 1.0626 7.38903 1.8833 16.12625 5.4893 28.3594 18.2385 33.5093 34.1786.6233 1.9293 1.1103 3.9046 1.4569 5.9128.0451.2614-.1846.4942-.4479.4504-1.8768-.3118-3.7266-.7464-5.5392-1.302C18.4498 83.8118 4.18498 68.5028.0091 49.1585zM.0491 36.6364c-.09955-.2968.13947-.5903.45002-.5543 2.31825.2685 4.60094.7241 6.83209 1.3648C23.9608 42.5396 36.5233 57.2024 39.7587 75.328c.3154 1.7644.519 3.556.6105 5.3671.0104.2061-.1462.3856-.3506.4032-1.4905.1282-2.9925.179-4.5028.1494C17.4683 78.9806 3.17736 59.7286.0491 36.6364z" />
    </svg>
  );
}

/**
 * OmniTool app logo — orbital hub mark.
 * Four satellite nodes on a subtle ring orbit a cyan center hub,
 * representing multiple tools converging into one platform.
 */
export function OmniToolLogo({ className }: IconProps) {
  return (
    <svg
      className={cn("h-7 w-7", className)}
      viewBox="0 0 512 512"
      role="img"
      aria-label="OmniTool"
    >
      <rect width="512" height="512" rx="112" fill="#0f172a" />
      <circle cx="256" cy="256" r="140" fill="none" stroke="#f8fafc" strokeWidth="28" strokeOpacity="0.5" />
      <circle cx="157" cy="157" r="32" fill="#f8fafc" />
      <circle cx="355" cy="157" r="32" fill="#f8fafc" />
      <circle cx="355" cy="355" r="32" fill="#f8fafc" />
      <circle cx="157" cy="355" r="32" fill="#f8fafc" />
      <circle cx="256" cy="256" r="52" fill="#38bdf8" />
    </svg>
  );
}

/**
 * Compact version of OmniTool logo for collapsed sidebar and small contexts.
 */
export function OmniToolMark({ className }: IconProps) {
  return (
    <svg
      className={cn("h-6 w-6", className)}
      viewBox="0 0 512 512"
      role="img"
      aria-label="OmniTool"
    >
      <rect width="512" height="512" rx="112" fill="#0f172a" />
      <circle cx="256" cy="256" r="140" fill="none" stroke="#f8fafc" strokeWidth="28" strokeOpacity="0.5" />
      <circle cx="157" cy="157" r="32" fill="#f8fafc" />
      <circle cx="355" cy="157" r="32" fill="#f8fafc" />
      <circle cx="355" cy="355" r="32" fill="#f8fafc" />
      <circle cx="157" cy="355" r="32" fill="#f8fafc" />
      <circle cx="256" cy="256" r="52" fill="#38bdf8" />
    </svg>
  );
}
