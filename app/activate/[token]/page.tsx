import { ACTIVATION_TOKEN_RE } from "@/lib/portal-access/identity";
import { inspectActivation, type InspectResult } from "@/lib/portal-access/orchestrate";
import { activationDeps } from "@/lib/portal-access/server";
import { ActivationClient } from "./activation-client";

export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info: InspectResult = ACTIVATION_TOKEN_RE.test(token)
    ? await inspectActivation(activationDeps(), token)
    : { state: "not_found" };
  return <ActivationClient token={token} info={info} />;
}
