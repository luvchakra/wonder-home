# WonderHome — Dependency-Driven Implementation Order

The order below resolves the earlier tension: security, API contracts, tests and observability are built into the foundation rather than bolted on later.

## Phase 0 — Greenfield bootstrap
1. `00-Project-Bootstrap-and-Architecture`

## Phase 1 — Identity, data and security foundation
2. `01-Identity-and-Family-Accounts`
3. `18-API-and-Developer-Platform`
4. `15-001` through `15-004` — Security Foundation & Data Protection
5. `19-001` through `19-006` — Automated Quality & Observability Foundation
6. `16-001` through `16-004` — Privileged Platform Operations Foundation
7. Core Supabase/RLS migrations from all dependent modules

## Phase 2 — Household operating model
8. `02-Household-Configuration-and-Playbook`
9. `03-Outcome-and-Routine-Engine`

## Phase 3 — Human interaction and trust
10. `04-Conversation-Voice-and-Text`
11. `05-Household-Certification`
12. `06-Actionable-Notifications`

## Phase 4 — AI execution
13. `14-AI-Orchestration-and-Learning`

## Phase 5 — Core household domains
14. `07-Househelper-and-Home-Operations`
15. `08-Kids-and-School-Intelligence`
16. `09-Commerce-Groceries-and-Pets`
17. `10-Meals-and-Cooking`
18. `11-Bills-and-Finance`
19. `12-Family-Time-and-Social`
20. `13-Maintenance-Laundry-and-Pet-Care`
21. `21-Health-and-Fitness`

## Phase 6 — External/platform capabilities
22. `17-External-Integrations`
23. `20-Subscriptions-Entitlements-and-Usage`
24. Remaining `16` platform-admin hardening
25. Remaining `15` advanced security/privacy and `19` production hardening

## Priority rule
Within each phase, implement dependency-ready P0 stories first, then P1, then P2. A provider outage or missing credential never blocks unrelated stories. Use interfaces, local fakes and deterministic fixtures until a real provider can be configured.
