import { Skeleton } from "@/components/ui/skeleton";

export default function RenewalDetailLoading() {
  return <div className="space-y-5" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-52" /></div>;
}
