# AqarBooks — provider review for Data safety

Read-only review, 9 October 2026. Proposed analysis, not an approved or saved declaration. No provider contract was accepted, production setting changed, database queried, or code deployed.

## Rules used

Companion code evidence: `GOOGLE_PLAY_DATA_CODE_AUDIT_2026-10-09.md`; payment path evidence and proposed controls: `GOOGLE_PLAY_FAWRY_V1_PLAN_2026-10-09.md`. Native dependency evidence is `mobile/build/app/intermediates/incremental/lintVitalAnalyzeRelease/release-artifact-dependencies.xml:197–216,422–438`, corroborated by direct AAB DEX inspection in the code audit. Official links below were opened and read on the review date; they are live published versions, not executed account-specific contracts.

[Google Play guidance](https://support.google.com/googleplay/android-developer/answer/10787469) defines collection as off-device transmission, including SDKs; server-to-server transfers can be sharing. Its service-provider exception requires processing on the developer's behalf and instructions. Local-only processing is excluded. Optional means all users can decline the data and still use the app's primary functionality. A public DPA alone does not prove an exception applies to this account, every data stream, or every purpose.

## Provider evidence and unresolved conditions

| Provider/stream | Official evidence | Proposed treatment | Required verification |
|---|---|---|---|
| Supabase application/auth/storage data | [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), version 1 August 2026: sections 2, 3.2–3.3 describe processor role, customer instructions and restrictions on selling, advertising and other purposes. [Privacy policy](https://supabase.com/privacy) separately covers service/account data. | Collection yes for transmitted application data. Service-provider exception is plausible for covered customer data, conditional; no final “not shared” answer. | Confirm FlowTech's actual account/contract and effective DPA, covered services, subprocessors, region, logs and purposes. Distinguish account/service metadata from customer payloads. No signed/effective account evidence obtained. |
| Resend transactional email payload | [DPA](https://resend.com/legal/dpa), updated 31 December 2025: sections 2.1–2.2 describe processor/instructions; preamble and section 12 link effectiveness to agreement acceptance/execution. Sections 1.7 and 9 treat usage/account data separately as independent-controller processing. Exhibit A has controller wording that needs clarification against processor sections. [Privacy policy](https://resend.com/legal/privacy-policy) describes service usage and diagnostics. | Collection yes for recipients, message content and related fields sent by backend. Do not apply blanket service-provider exception to payload and metadata together. | Obtain actual effective DPA from dashboard, resolve Exhibit A scope with provider/qualified reviewer, inspect open/link tracking and recipient metadata in actual account. Never assume tracking disabled from code omission. |
| Google ML Kit barcode scanning | [Terms/privacy](https://developers.google.com/ml-kit/terms): inputs/results processed on device, metrics sent to Google for performance, maintenance, improvement and abuse detection. [Data disclosure](https://developers.google.com/ml-kit/android-data-disclosure): device/app info, installation IDs, latency, configuration, input/output sizes, events and error codes; HTTPS. | Include proposed collection of Device or other IDs, Diagnostics/other performance data, and feature usage where applicable. Google is a recipient. Google saying it does not onward-share is not proof FlowTech→Google is exempt sharing. No evidence of processing exclusively on FlowTech instructions. Treat sharing as unresolved, with “yes unless an applicable exception is evidenced” candidate. | Local audit identifies barcode SDK 17.3.0; official disclosure describes latest versions. Verify version-specific behavior and actual release runtime. Determine optionality across all roles: scanner telemetry may be necessary for gate functionality, so don't label optional merely because other roles don't scan. |
| Cloudflare hosting/security if serving app endpoints | [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), section 3.1(a), describes limited service purpose and customer instructions; effectiveness requires agreement. | Conditional service-provider candidate for covered endpoint data. No automatic exclusion of independent-controller/security metadata. | Confirm actual production host, relevant products, effective DPA, logs/retention/analytics and scope. Current local hosting config alone does not prove deployment. |
| Fawry | User explicitly confirms no active commercial agreement. Technical activation/configuration is not independently verified. [Published data protection policy](https://www.fawry.com/wp-content/uploads/2022/08/fawry-data-protection-policy.pdf) is a generic policy, not an executed merchant DPA. | Current code paths remain part of current-artifact audit; planned V1 exclusion only after server/client disablement, replacement AAB and tests. No contractual exception confirmed. | Verify deployed paths blocked, no charges/reference generation/replay, no outgoing customer payload. No real payment test. Financial features declaration remains open because administrative finances remain. |

## Proposed form-level answers

- Collect/share required data types: **Yes** (collection clearly exists). This does not mean every type is shared.
- Encrypted in transit: **candidate Yes**, only after final endpoints, redirects, SDK and runtime traffic verification. Source HTTPS is insufficient for a blanket verified claim.
- Account creation mechanisms: native email/password and account activation are evident in code; choose exact Console account-creation options only after confirming which creation is possible inside app versus admin provisioning.
- Deletion mechanism: verify actual public request route, response process, retention exceptions and app workflow. Do not claim an automated deletion implementation from policy text.
- Independent security review/Families badge: no evidence to claim either.
- Ads/AD ID are separate from telemetry. “No ads” does not imply “No analytics or diagnostics”.

## Human/operational evidence required before final approval

1. Actual effective Supabase/Resend/hosting contracts and account-level configuration, with sensitive parts redacted.
2. Resolve Resend payload-versus-controller metadata and tracking scope; confirm all other recipients.
3. Version-specific ML Kit telemetry and release runtime verification, then explicit sharing/optionality decisions.
4. Identify the first party and property-management organizations receiving data; a tenant boundary does not establish these are the same legal entity as FlowTech.
5. Verify deletion requests, retention, financial/visitor/gate records, and whether attachments can contain sensitive data.
6. Approve Fawry-disable plan, implement only after permission, rebuild only after permission, test replacement artifact, and then approve final Data safety matrix.

This review intentionally does not convert missing contractual evidence into either a verified exemption or a claim that all transfers are necessarily reportable sharing. The final per-type matrix must incorporate the code audit and resolved conditions.
