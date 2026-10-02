import { Skeleton } from "@/components/ui/skeleton";

export default function OperationsDashboardLoading() {
  return <div className="space-y-5" aria-busy="true" aria-label="Loading operations dashboard">
    <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-full max-w-xl" /></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
  </div>;
}
