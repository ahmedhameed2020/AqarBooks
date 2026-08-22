import React from "react";

interface FlagProps {
  countryCode: string;
  className?: string;
}

export function CountryFlag({ countryCode, className = "size-7" }: FlagProps) {
  const code = countryCode.toUpperCase();

  switch (code) {
    case "EG":
      // Egypt Flag: Red, White, Black with Golden Eagle
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#ce1126" d="M0 0h640v160H0z" />
          <path fill="#fff" d="M0 160h640v160H0z" />
          <path fill="#000" d="M0 320h640v160H0z" />
          {/* Golden Eagle */}
          <g transform="translate(290, 205) scale(0.6)">
            <path
              fill="#c09300"
              d="M50 0c-8 10-15 25-15 40 0 10 3 20 8 28-15 2-25 10-25 22 0 10 8 18 20 20-5 10-5 25 0 35 10 20 30 25 42 25s32-5 42-25c5-10 5-25 0-35 12-2 20-10 20-20 0-12-10-20-25-22 5-8 8-18 8-28 0-15-7-30-15-40-5 8-15 15-25 15s-20-7-25-15z"
            />
            <path fill="#fff" d="M45 75h30v40H45z" />
            <path fill="#ce1126" d="M45 75h10v40H45z" />
            <path fill="#000" d="M65 75h10v40H65z" />
          </g>
        </svg>
      );

    case "SA":
      // Saudi Arabia Flag: Green field with White Shahada & Sword
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#006c35" d="M0 0h640v480H0z" />
          {/* Stylized Arabic Script & Sword */}
          <g fill="#fff" transform="translate(140, 160) scale(0.9)">
            <path d="M40 30h280v14H40zM60 10h30v54H60zm60-10h20v74h-20zm50 15h25v59h-25zm60-10h20v74h-20zm50 15h25v59h-25z" />
            {/* Sword */}
            <path d="M30 110h280v10H30zm-20-5h20v20H10zm0 5l-10-15 5-5 15 15-5 5z" />
          </g>
        </svg>
      );

    case "AE":
      // UAE Flag: Green, White, Black horizontal + Red vertical
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#00732f" d="M0 0h640v160H0z" />
          <path fill="#fff" d="M0 160h640v160H0z" />
          <path fill="#000" d="M0 320h640v160H0z" />
          <path fill="#ff0000" d="M0 0h160v480H0z" />
        </svg>
      );

    case "KW":
      // Kuwait Flag: Green, White, Red horizontal + Black trapezoid
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#007a3d" d="M0 0h640v160H0z" />
          <path fill="#fff" d="M0 160h640v160H0z" />
          <path fill="#ce1126" d="M0 320h640v160H0z" />
          <path fill="#000" d="M0 0v480l160-160V160z" />
        </svg>
      );

    case "QA":
      // Qatar Flag: Maroon & White with 9 serrated points
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#8d1b3d" d="M0 0h640v480H0z" />
          <path
            fill="#fff"
            d="M0 0h180l40 26.6-40 26.7 40 26.7-40 26.7 40 26.6-40 26.7 40 26.7-40 26.6 40 26.7-40 26.7 40 26.6-40 26.7 40 26.7-40 26.7 40 26.6-40 26.7 40 26.7-40 26.6 40 26.7-40 26.7H0z"
          />
        </svg>
      );

    case "BH":
      // Bahrain Flag: Red & White with 5 serrated points
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#ce1126" d="M0 0h640v480H0z" />
          <path
            fill="#fff"
            d="M0 0h160l60 48-60 48 60 48-60 48 60 48-60 48 60 48-60 48 60 48-60 48H0z"
          />
        </svg>
      );

    case "OM":
      // Oman Flag: White, Red, Green horizontal + Red vertical with Emblem
      return (
        <svg
          viewBox="0 0 640 480"
          className={`rounded-sm overflow-hidden shadow-xs border border-slate-200/80 shrink-0 ${className}`}
          aria-hidden="true"
        >
          <path fill="#fff" d="M0 0h640v160H0z" />
          <path fill="#db161c" d="M0 160h640v160H0z" />
          <path fill="#008000" d="M0 320h640v160H0z" />
          <path fill="#db161c" d="M0 0h160v480H0z" />
          {/* Khanjar dagger emblem */}
          <g fill="#fff" transform="translate(45, 35) scale(0.6)">
            <path d="M30 10l-20 40h40zm0 70l-25-30h50z" />
            <path d="M10 50h40v15H10z" />
          </g>
        </svg>
      );

    case "GLOBAL":
    default:
      // Global Flag / Emblem
      return (
        <div
          className={`flex items-center justify-center rounded-sm bg-linear-to-br from-blue-600 to-indigo-700 text-white shadow-xs shrink-0 ${className}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4/5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
          </svg>
        </div>
      );
  }
}
