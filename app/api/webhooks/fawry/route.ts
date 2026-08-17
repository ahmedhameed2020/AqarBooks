import { createWebhookRouteHandler } from "@/lib/payments/webhook-handler";
import { fawryAdapter } from "@/lib/payments/providers/fawry";

export const POST = createWebhookRouteHandler(fawryAdapter);
