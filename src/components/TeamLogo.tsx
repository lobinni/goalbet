"use client";

import { useState } from "react";
import { getTeamLogoUrl } from "@/lib/team-logos";
import { getFlag } from "@/lib/matches";

interface TeamLogoProps {
  teamCode: string;
  teamName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

export default function TeamLogo({
  teamCode,
  teamName,
  size = "md",
  className = "",
}: TeamLogoProps) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getTeamLogoUrl(teamCode);
  const sizeClass = sizeMap[size];

  // If we have a logo URL and it hasn't errored, show the image
  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={teamName}
        className={`${sizeClass} object-contain drop-shadow-lg ${className}`}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  // Fallback to emoji flag
  const flag = getFlag(teamCode);
  const emojiSize = size === "lg" ? "text-4xl" : size === "md" ? "text-3xl" : "text-2xl";

  return (
    <span className={`${emojiSize} ${className}`} role="img" aria-label={teamName}>
      {flag}
    </span>
  );
}
