"use client";

import { DataLoadErrorView } from "@/components/data-load-error";

export default function RouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <DataLoadErrorView {...props} />;
}
