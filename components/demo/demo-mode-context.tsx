"use client";

import { createContext, useContext } from "react";

/**
 * Makes "am I in the demo?" available to client components.
 *
 * WHY A CONTEXT AND NOT A PROP DRILL
 * The only client code that needs this is buried several levels down -- the
 * export buttons inside the units and members toolbars. Threading a boolean
 * through every intermediate component to reach them would touch a dozen files
 * that have no interest in the demo.
 *
 * WHY THIS IS NOT A SECURITY BOUNDARY
 * It is a presentation flag and nothing more. It comes from the server layout,
 * which derives it from the session's organization, but a client value can
 * always be tampered with in a browser. Nothing is authorised on the strength
 * of it: the write barrier lives in lib/demo/guard.ts on the server, and the
 * database refuses independently of both. The worst a tampered value can do is
 * add or remove a label on a spreadsheet of fictional data.
 */
const DemoModeContext = createContext(false);

export function DemoModeProvider({
  isDemo,
  children,
}: {
  isDemo: boolean;
  children: React.ReactNode;
}) {
  return <DemoModeContext.Provider value={isDemo}>{children}</DemoModeContext.Provider>;
}

/** False outside the provider, which is the correct default for every real tenant. */
export function useDemoMode(): boolean {
  return useContext(DemoModeContext);
}
