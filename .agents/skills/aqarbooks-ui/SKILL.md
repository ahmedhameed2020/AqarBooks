---
name: aqarbooks-ui
description: >
  AqarBooks UI/UX engineering and visual quality standard. Use when creating,
  redesigning, reviewing, or refining any AqarBooks page, screen, component,
  dashboard, table, form, report, navigation, or frontend workflow. Trigger on
  requests involving UI, UX, design, redesign, visual polish, layout,
  responsiveness, RTL/LTR, accessibility, frontend consistency, or making a
  screen look premium, modern, enterprise-grade, or world-class.
---

# AqarBooks UI/UX Engineering Skill

## 1. ROLE

You are the **Lead Product Designer + Senior Frontend Engineer** for AqarBooks.

AqarBooks is a premium **Real Estate Accounting Platform**.

It combines:

* Real estate
* Accounting
* Financial control
* Property entities
* Owners
* Units
* Receivables
* Payables
* Treasury
* Tax
* Financial reporting
* Auditability

AqarBooks is not a generic SaaS dashboard.

It is software that controls financial information associated with valuable real estate.

Every interface must communicate:

**Precision. Trust. Control. Clarity. Financial intelligence. Architectural sophistication.**

---

# 2. SOURCE OF TRUTH

The visual system has three levels of authority:

### Level 1 — Existing project system

Before creating anything, inspect:

* existing design tokens
* CSS variables
* theme configuration
* component library
* UI primitives
* typography
* spacing
* existing page patterns
* navigation
* table patterns
* form patterns
* modal/drawer patterns

Reuse existing components whenever they are appropriate.

### Level 2 — This skill

If the existing implementation conflicts with this skill, prefer this skill for new or intentionally redesigned UI.

Do not rewrite unrelated legacy UI merely for visual consistency unless explicitly requested.

### Level 3 — Explicit owner instruction

If the product owner explicitly overrides a design rule, follow the owner's instruction.

---

# 3. CORE PRINCIPLE

The objective is NOT:

> Make the interface look fancy.

The objective is:

> Make the interface feel like a serious global financial product designed specifically for real estate.

Prioritize:

1. Information hierarchy
2. Task completion
3. Financial clarity
4. Consistency
5. Accessibility
6. Performance
7. Visual refinement
8. Decoration

Decoration is always last.

---

# 4. AqarBooks VISUAL DNA

The visual language combines:

**Financial precision**
+
**Architectural elegance**
+
**Enterprise software discipline**
+
**Modern SaaS usability**

The interface should feel:

* premium
* calm
* intelligent
* precise
* mature
* trustworthy
* structured
* efficient

Avoid anything that makes the product feel:

* childish
* flashy
* cheap
* template-generated
* crypto-like
* gaming-like
* overly playful
* excessively decorative

---

# 5. DO NOT COPY COMPETITORS

Do not reproduce the visual identity of:

* SAP
* Oracle
* Microsoft Dynamics
* Odoo
* QuickBooks
* Xero
* generic admin templates

Study patterns conceptually when necessary, but create an independent AqarBooks visual language.

The goal is:

> Recognizable as AqarBooks.

---

# 6. BRAND EXPRESSION

The brand should subtly communicate:

**Aqar = Real Estate**

**Books = Accounting**

The interface may use architectural cues through:

* geometric structure
* precise grids
* strong alignment
* disciplined spacing
* subtle architectural proportions

Do NOT use:

* literal house icons everywhere
* generic building illustrations
* excessive real-estate imagery
* cliché roof symbols

The product is about financial control of real estate, not real-estate advertising.

---

# 7. COLOR PHILOSOPHY

Use a restrained premium palette.

The exact production colors must come from the project's existing design tokens when available.

If tokens do not exist, establish them consistently rather than inventing colors page by page.

### Primary character

Deep navy / midnight tones may establish the brand foundation.

### Workspace

Prefer refined neutral surfaces:

* warm white
* cool off-white
* light neutral gray

Avoid sterile pure-white everywhere.

### Accent

Use a controlled blue / indigo / royal accent.

Accent colors communicate:

* primary action
* selection
* focus
* navigation
* links

Do not use accent color as decoration.

---

# 8. SEMANTIC COLORS

Colors must communicate meaning.

### Success

Use for:

* paid
* reconciled
* approved
* completed
* healthy

### Warning

Use for:

* pending
* due soon
* attention required

### Danger

Use for:

* overdue
* failed
* rejected
* critical
* destructive actions

### Informational

Use for:

* neutral system information
* informational status

Do not use semantic colors merely because they look attractive.

---

# 9. TYPOGRAPHY

Typography must prioritize financial readability.

Use the project's existing typography system.

If no system exists:

* use a professional modern sans-serif
* use a high-quality Arabic UI font for Arabic
* avoid decorative fonts

### Hierarchy

Use clear levels for:

* page title
* section title
* card title
* table header
* body
* metadata
* helper text

Do not use enormous headings inside application screens.

AqarBooks is a working application, not a marketing landing page.

---

# 10. NUMBERS ARE FIRST-CLASS UI

Financial numbers require deliberate typography.

Examples:

EGP 2,845,300.00

SAR 184,500.00

USD 42,300.00

Maintain:

* consistent decimal precision
* thousands separators
* currency formatting
* negative-value treatment
* alignment

Financial numbers should be easy to scan.

Never bury critical amounts in decorative UI.

---

# 11. SPACING

Use a consistent spacing scale.

Prefer a controlled rhythm such as:

4
8
12
16
20
24
32
40
48

Do not introduce arbitrary spacing values unless necessary.

Whitespace should establish hierarchy.

Do not create enormous empty areas merely to make a screen look "premium".

---

# 12. BORDER RADIUS

Use restrained radius.

AqarBooks should not look like a consumer fintech application.

Prefer:

* subtle card radius
* small input radius
* moderate dialog radius
* controlled button radius

Avoid:

* giant pills
* excessive rounded containers
* every component being heavily rounded

---

# 13. SHADOWS

Prefer:

* borders
* surface contrast
* subtle elevation

Avoid:

* dramatic shadows
* neon glows
* floating-card overload
* excessive blur

Premium means precision, not effects.

---

# 14. APPLICATION LAYOUT

The primary application structure should generally support:

SIDEBAR
+
TOP BAR
+
MAIN WORKSPACE

The layout must maximize useful workspace.

Accounting users need horizontal space for:

* journals
* ledgers
* invoices
* payment allocations
* reconciliation
* reports
* filters

Do not waste screen width on oversized navigation.

---

# 15. SIDEBAR

The sidebar must be:

* predictable
* compact
* elegant
* readable
* hierarchical

Use visual grouping.

Example conceptual structure:

Dashboard

Accounting

* Chart of Accounts
* Journal Entries
* General Ledger
* Trial Balance
* Financial Reports

Receivables

* Customers / Owners
* Invoices
* Collections
* Aging

Payables

* Vendors
* Bills
* Payments

Treasury

* Cash
* Banks
* Transfers
* Reconciliation

Properties

* Properties
* Buildings
* Units
* Owners

Administration

* Users
* Roles
* Audit Log
* Settings

Do not assume this exact navigation must exist.

Use the actual project's modules.

---

# 16. PAGE HEADER

Every significant page should establish:

* location/context
* page title
* concise description when useful
* primary action
* secondary actions
* filters when appropriate

Do not create oversized hero sections inside application pages.

---

# 17. PAGE HIERARCHY

A strong page should generally follow:

Context
→ Title
→ Primary action
→ Key information
→ Filters
→ Main content
→ Secondary information

The exact structure depends on the workflow.

Do not force every page into a template.

---

# 18. DASHBOARDS

Dashboards are decision surfaces, not collections of cards.

Every KPI should answer:

> Why should the user care?

Examples:

* Cash position
* Outstanding receivables
* Overdue receivables
* Payables due
* Revenue
* Expenses
* Net position
* Collections
* Reconciliation exceptions

Avoid:

* meaningless KPI percentages
* decorative charts
* excessive cards
* random metrics

---

# 19. KPI CARDS

A good KPI card contains:

* meaningful label
* primary value
* useful context
* optional comparison/trend
* clear status
* drill-down when appropriate

Avoid making every KPI card visually identical if their importance differs.

The hierarchy should reflect business importance.

---

# 20. TABLES

Tables are fundamental to AqarBooks.

Prefer tables when users need to:

* compare records
* scan many records
* sort
* filter
* select
* inspect statuses
* perform bulk actions

Do not convert every dataset into cards.

### Table requirements

Where appropriate support:

* sorting
* filtering
* pagination
* column visibility
* row selection
* bulk actions
* export
* row actions
* drill-down

---

# 21. TABLE DENSITY

Default density:

**Compact but readable.**

Avoid:

* giant row heights
* excessive padding
* unnecessary icons
* decorative columns

Users should see substantial information without feeling overwhelmed.

---

# 22. FINANCIAL ALIGNMENT

Financial values should have consistent alignment.

Use appropriate numeric alignment and preserve readability under RTL.

Do not allow Arabic directionality to visually corrupt:

* amounts
* dates
* account codes
* invoice numbers
* reference numbers

---

# 23. FORMS

Forms must reflect the user's mental model.

Group fields logically.

Examples:

Transaction Information

Financial Information

Tax Information

Allocation

Supporting Documents

Approval

Audit Information

Do not create one giant undifferentiated form.

Use progressive disclosure for advanced fields.

---

# 24. JOURNAL ENTRY UX

Journal entry screens must communicate accounting discipline.

Clearly expose:

* entry number
* date
* description
* reference
* status

For lines:

* account
* description
* debit
* credit
* relevant dimensions

Show:

TOTAL DEBIT

TOTAL CREDIT

BALANCED / NOT BALANCED

The balance state must be immediately visible.

Do not hide an accounting imbalance inside a generic form error.

---

# 25. RECEIVABLES UX

Users should quickly understand:

* outstanding amount
* current balance
* overdue amount
* aging
* payment status
* allocation
* owner/unit context
* collection history

Where applicable use aging buckets such as:

Current
1–30
31–60
61–90
90+

---

# 26. PROPERTY CONTEXT

AqarBooks deals with financial information connected to real estate.

Where relevant, preserve context such as:

Organization
→ Property
→ Building
→ Unit
→ Owner
→ Financial Activity

The user must always understand:

> Whose financial information am I viewing?

Do not add irrelevant property context to unrelated workflows.

---

# 27. SEARCH AND FILTERS

Enterprise users search.

Filters should be:

* discoverable
* compact
* logically grouped
* reusable

Potential filters:

* date
* property
* building
* unit
* owner
* account
* status
* amount
* currency
* reference

Use advanced filters when complexity requires them.

---

# 28. ACTION HIERARCHY

Every page should have a clear primary action.

Use:

Primary
Secondary
Tertiary
Danger

Do not give five actions equal visual weight.

The most important action should be visually obvious.

---

# 29. MODALS

Use modals for focused tasks.

Good:

* confirmation
* simple edit
* quick action
* small form

Bad:

* complete accounting workflows inside enormous modals

Complex workflows deserve dedicated pages.

---

# 30. DRAWERS

Use drawers for contextual inspection.

Good use cases:

* record details
* audit information
* activity history
* quick preview
* related information

A drawer should allow users to inspect information without unnecessarily losing table context.

---

# 31. AUDIT UI

Auditability should be available without overwhelming the primary workflow.

Where relevant expose:

* created by
* created at
* updated by
* updated at
* status
* history
* references
* activity

Important financial records should never feel untraceable.

---

# 32. EMPTY STATES

Never use a meaningless:

"No data."

Explain:

* what is empty
* why it matters
* what action the user can take

Example:

"No journal entries exist for this accounting period."

Then provide the relevant action where appropriate.

---

# 33. LOADING STATES

Use:

* skeletons
* stable layout
* progressive loading where appropriate

Do not cause large layout shifts.

Tables should preserve their structure during loading.

---

# 34. ERROR STATES

Errors must be:

* specific
* actionable
* calm

Bad:

"Something went wrong."

Better:

"Payment could not be posted because the selected cash account is inactive."

Do not expose unnecessary technical implementation details to normal users.

---

# 35. CONFIRMATION UX

High-risk financial operations require explicit confirmation.

Examples:

* post
* void
* reverse
* refund
* write-off
* transfer
* reconcile
* close period
* reopen period

The confirmation must communicate:

WHAT will happen.

WHAT record is affected.

WHAT financial consequence may occur.

Avoid generic:

"Are you sure?"

---

# 36. RTL / LTR

Arabic is a first-class language.

English is a first-class language.

Do not design English first and mechanically mirror it.

Use logical layout properties:

* margin-inline
* padding-inline
* inset-inline
* border-inline

Test both directions.

Verify:

* navigation
* icons
* tables
* forms
* dialogs
* drawers
* breadcrumbs
* numbers
* dates
* action placement

---

# 37. RESPONSIVE DESIGN

Desktop is the primary environment for accounting workflows.

Still support:

* laptop
* tablet
* mobile where appropriate

Do not simply shrink desktop layouts.

For smaller screens:

* prioritize essential information
* collapse secondary fields
* use drawers where useful
* allow controlled horizontal scrolling for complex tables
* preserve financial readability

---

# 38. ACCESSIBILITY

Use semantic HTML.

Ensure:

* keyboard navigation
* visible focus
* sufficient contrast
* meaningful labels
* accessible form errors
* appropriate ARIA where required
* non-color-only status communication

Do not sacrifice accessibility for visual styling.

---

# 39. ICONOGRAPHY

Use one coherent icon system.

Icons must communicate meaning.

Avoid decorative icon spam.

Do not mix unrelated icon styles.

---

# 40. CHARTS

Charts exist to answer business questions.

Good:

* receivables aging
* cash flow
* revenue vs expenses
* collections trend
* expense analysis

Bad:

* chart added merely because there is empty space

Every chart should have:

* meaningful title
* useful units
* understandable time range
* appropriate labels
* accessible tooltip/legend

---

# 41. MICROINTERACTIONS

Animations should communicate state or improve usability.

Use subtle transitions for:

* navigation
* loading
* modal transitions
* success
* state changes

Avoid:

* bouncing
* excessive motion
* parallax
* flashy effects

The application should feel fast.

---

# 42. ANTI-GENERIC-UI RULES

Never introduce:

* random gradients
* excessive glassmorphism
* huge rounded cards
* giant headings
* meaningless charts
* excessive purple
* excessive shadows
* excessive animations
* random emoji
* random icon styles
* inconsistent spacing
* inconsistent buttons
* random border radii
* template-like layouts

If the implementation looks like a generic AI-generated SaaS dashboard:

**STOP AND REWORK IT.**

---

# 43. COMPONENT REUSE

Before creating a component:

1. Search the codebase.
2. Find existing equivalent components.
3. Reuse if appropriate.
4. Extend if necessary.
5. Create a new component only when justified.

Do not create:

ButtonA
ButtonB
ButtonPremium
ButtonModern
ButtonNew

when one coherent button system is sufficient.

---

# 44. DO NOT REBUILD THE DESIGN SYSTEM

If an existing component works:

use it.

Do not replace the project's component library merely because another implementation looks prettier.

Visual consistency is more important than local perfection.

---

# 45. UI IMPLEMENTATION PROCESS

For every UI task follow:

## STEP 1 — INSPECT

Inspect:

* route
* page
* related components
* design tokens
* existing patterns
* data structures
* responsive behavior

## STEP 2 — UNDERSTAND

Identify:

* user
* goal
* primary task
* important information
* risky actions
* accounting context

## STEP 3 — PLAN

Determine:

* hierarchy
* layout
* components
* states
* responsive behavior
* RTL behavior

## STEP 4 — IMPLEMENT

Reuse existing components.

Follow this skill.

Preserve functionality.

Do not modify unrelated modules.

## STEP 5 — VERIFY

Check:

* functional behavior
* visual hierarchy
* spacing
* typography
* tables
* forms
* states
* RTL
* LTR
* responsive behavior

## STEP 6 — VISUAL QA

Do not consider the task complete merely because the code compiles.

Inspect the actual rendered UI.

Look specifically for:

* generic AI appearance
* awkward spacing
* excessive cards
* poor hierarchy
* weak typography
* visual noise
* inconsistent components
* broken RTL
* poor table density
* unnecessary decoration

## STEP 7 — REFINE

Fix visual issues discovered during QA.

Then perform a final consistency check.

---

# 46. VISUAL QA CHECKLIST

Before completion ask:

### Hierarchy

* Is the most important information obvious?
* Is the primary action obvious?
* Is secondary information visually subordinate?

### Spacing

* Is spacing consistent?
* Are sections separated appropriately?
* Are there unnecessary large gaps?

### Typography

* Is text readable?
* Are headings appropriately sized?
* Are financial numbers prominent enough?

### Components

* Are existing components reused?
* Are buttons consistent?
* Are inputs consistent?
* Are tables consistent?

### Color

* Are colors semantic?
* Is accent color restrained?
* Is anything unnecessarily colorful?

### Density

* Does the page provide enough information?
* Is it still comfortable to scan?

### RTL

* Does Arabic feel native?
* Are numbers readable?
* Are icons positioned correctly?

### Responsive

* Does the page remain usable at smaller widths?
* Are important actions still accessible?

### Brand

Ask:

> Does this unmistakably feel like AqarBooks?

---

# 47. SCREENSHOT / VISUAL REFERENCE RULE

If screenshots or design references are available:

inspect them carefully before implementation.

Use them to understand:

* hierarchy
* spacing
* composition
* visual tone
* density
* component relationships

Do not blindly copy pixels if the existing architecture requires a different implementation.

---

# 48. DESIGN IMPROVEMENT RULE

When asked:

"Make this page better."

Do not automatically redesign everything.

First identify the actual weaknesses.

Then improve the highest-impact issues:

1. hierarchy
2. layout
3. information density
4. typography
5. spacing
6. component consistency
7. states
8. visual polish

Preserve useful existing patterns.

---

# 49. FUNCTIONAL VS VISUAL CHANGES

When asked for a visual change:

Do not alter:

* accounting logic
* calculations
* database behavior
* permissions
* API behavior

unless explicitly required.

When a visual requirement exposes a functional problem:

report the issue separately.

---

# 50. PRODUCT AUDIT INTEGRATION

If the `aqarbooks-product-audit` skill identifies missing functionality:

Do not automatically invent UI for unapproved functionality.

First determine whether the capability has been approved.

If approved:

design the workflow according to this skill.

If not approved:

do not silently expand scope.

---

# 51. WORLD-CLASS UI DOES NOT MEAN MORE UI

Do not add:

* more cards
* more charts
* more buttons
* more tabs
* more colors
* more information

unless they improve the user's ability to understand or complete the task.

World-class UI is often achieved by removing unnecessary complexity.

---

# 52. FINANCIAL SAFETY

When visual convenience conflicts with financial safety:

**financial safety wins.**

When visual simplicity conflicts with required accounting information:

**accounting clarity wins.**

When animation conflicts with speed:

**speed wins.**

When decoration conflicts with hierarchy:

**hierarchy wins.**

---

# 53. FINAL STANDARD

AqarBooks should feel like:

> **A premium financial operating system for real estate.**

Not:

> a generic accounting application.

Not:

> a generic ERP.

Not:

> a property-management template.

Not:

> an AI-generated dashboard.

The desired impression is:

**"This is serious software built for serious financial operations."**

---

# 54. COMPLETION CRITERIA

A UI task is complete only when:

* requested functionality works
* existing functionality remains intact
* components follow the AqarBooks system
* layout is coherent
* hierarchy is clear
* financial information is readable
* Arabic RTL works
* English LTR works
* responsive behavior is acceptable
* loading/error/empty states are handled
* dangerous actions are clearly communicated
* no obvious generic-AI visual patterns remain
* actual rendered UI has been visually reviewed

Never declare completion solely because:

* the code compiles
* the route loads
* the API works
* the component renders

The rendered product matters.

---

# FINAL COMMAND

For every AqarBooks UI task:

**Inspect → Understand → Plan → Implement → Render → Review → Refine → Verify**

Do not skip Visual QA.

Do not invent a new visual language.

Do not sacrifice financial clarity for decoration.

Do not sacrifice consistency for novelty.

Do not sacrifice usability for aesthetics.

Build AqarBooks as a coherent, premium, global real-estate accounting product.
