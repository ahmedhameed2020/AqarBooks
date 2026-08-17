"use client";

export function FlowLinesBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 bg-[#060a18]">
      {/* Subtle radial ambient gradients on Dark Blue */}
      <div className="absolute -top-40 start-1/2 -translate-x-1/2 w-[900px] h-[550px] bg-gradient-to-b from-purple-600/20 via-blue-600/15 to-transparent rounded-full blur-[140px] opacity-75" />
      <div className="absolute top-[35%] -start-40 w-[600px] h-[600px] bg-gradient-to-tr from-purple-900/30 via-indigo-900/20 to-transparent rounded-full blur-[130px]" />
      <div className="absolute top-[65%] -end-40 w-[650px] h-[650px] bg-gradient-to-tl from-blue-900/30 via-purple-900/20 to-transparent rounded-full blur-[130px]" />

      {/* Grid Pattern overlay for crisp precision */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Animated SVG Flow Lines & Wave Paths */}
      <svg
        className="absolute inset-0 w-full h-full opacity-70"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="flow-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.4" />
          </linearGradient>

          <linearGradient id="flow-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#A78BFA" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.4" />
          </linearGradient>

          <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Dynamic Curved Laser Flow Lines */}
        <path
          d="M-100,160 C320,300 450,-40 850,180 C1150,340 1350,120 1600,220"
          fill="none"
          stroke="url(#flow-grad-1)"
          strokeWidth="2.5"
          className="animate-flow-dash-1"
          filter="url(#glow-filter)"
        />

        <path
          d="M-100,240 C280,420 520,60 920,280 C1220,440 1380,220 1600,320"
          fill="none"
          stroke="url(#flow-grad-2)"
          strokeWidth="2"
          strokeDasharray="8 12"
          className="animate-flow-dash-2"
        />

        <path
          d="M-100,380 C360,560 620,180 1020,420 C1320,580 1420,360 1600,460"
          fill="none"
          stroke="url(#flow-grad-1)"
          strokeWidth="1.5"
          className="animate-flow-dash-3 opacity-60"
        />

        <path
          d="M-100,600 C400,450 700,750 1100,520 C1350,380 1480,620 1600,580"
          fill="none"
          stroke="url(#flow-grad-2)"
          strokeWidth="2"
          strokeDasharray="12 16"
          className="animate-flow-dash-1"
        />

        {/* Ambient Floating Glow Nodes */}
        <circle cx="450" cy="120" r="4" fill="#A78BFA" className="animate-ping opacity-60" />
        <circle cx="850" cy="180" r="5" fill="#60A5FA" className="animate-pulse" />
        <circle cx="1150" cy="340" r="4" fill="#C4B5FD" className="animate-ping opacity-50" />
        <circle cx="280" cy="420" r="3.5" fill="#38BDF8" className="animate-pulse" />
        <circle cx="1020" cy="420" r="4.5" fill="#A78BFA" className="animate-pulse" />
      </svg>
    </div>
  );
}
