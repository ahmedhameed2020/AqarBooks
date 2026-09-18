import { Skeleton } from "@/components/ui/skeleton";

export default function PortalLeasesLoading() {
  return <div className="space-y-5" aria-busy="true" aria-label="Loading leases"><Skeleton className="h-16 w-full" /><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-24" />)}</div><div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-44" />)}</div></div>;
}
