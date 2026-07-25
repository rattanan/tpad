import { useId } from "react";
import styles from "./ifs-logo.module.css";

type Props = {
  className?: string;
  markOnly?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "dark" | "light";
};

const rayLengths = [27, 21, 24, 18, 25, 20, 28, 22, 26, 19, 28, 21, 25, 18, 24, 20, 27, 21, 25, 19];

export function IfsLogo({ className = "", markOnly = false, size = "md", variant = "dark" }: Props) {
  const gradientId = `ifs-logo-gradient-${useId().replaceAll(":", "")}`;
  const highlightId = `ifs-logo-highlight-${useId().replaceAll(":", "")}`;
  return <span className={`${styles.root} ${styles[size]} ${styles[variant]} ${markOnly ? styles.markOnly : ""} ${className}`} role={markOnly ? "img" : undefined} aria-label={markOnly ? "IFS Insight" : undefined}>
    <span className={styles.markShell} aria-hidden={!markOnly}>
      <svg className={styles.mark} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="12" y1="10" x2="89" y2="90"><stop stopColor="#cc43ff"/><stop offset=".48" stopColor="#8d42ed"/><stop offset="1" stopColor="#4c9fff"/></linearGradient>
          <linearGradient id={highlightId} gradientUnits="userSpaceOnUse" x1="28" y1="8" x2="70" y2="88"><stop stopColor="#f5c6ff" stopOpacity=".75"/><stop offset=".55" stopColor="#9d71ff" stopOpacity=".22"/><stop offset="1" stopColor="#8dd9ff" stopOpacity=".6"/></linearGradient>
        </defs>
        <circle cx="50" cy="50" r="25"/>
        <g fill={`url(#${gradientId})`}>
          {rayLengths.map((length, index) => <rect key={index} x="46" y={index % 4 === 0 ? 3 : index % 3 === 0 ? 7 : 10} width="8" height={length} rx="4" transform={`rotate(${index * 18} 50 50)`}/>) }
        </g>
        <g fill={`url(#${highlightId})`} opacity=".75">
          {[1, 5, 9, 13, 17].map((index) => <rect key={index} x="47.5" y="8" width="3" height="13" rx="1.5" transform={`rotate(${index * 18} 50 50)`}/>) }
        </g>
      </svg>
    </span>
    {!markOnly && <span className={styles.wordmark}>IFS <strong>Insight</strong></span>}
  </span>;
}
