# Security Specification & Payload-First TDD (`Christmas Night 2026`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`/{document=**}`).
2. **PII Isolation**: `/bookings/{bookingId}` contains customer `email`, `phone`, and `customerName`; public or non-admin users cannot `get`, `list`, `create`, `update`, or `delete` `/bookings` or `/tickets` directly via the client SDK.
3. **Trusted Admin Verification**: Admin identity requires `request.auth != null && request.auth.token.email_verified == true` AND either the bootstrapped organizer email (`prathamkumar1703@gmail.com`) or existence in `/admins/{request.auth.uid}`.
4. **No Self-Assigned Privileges**: Non-admin users can never write to `/admins/{uid}`, `/eventConfig/{configId}`, or `/ticketCategories/{categoryId}`.
5. **Terminal State & Field Validation**: Bookings and tickets validate exact required/allowed key sets, strict string `.size()` bounds, numeric bounds (`>= 0`), and regex-guarded document IDs (`^[a-zA-Z0-9_\-]+$`).
6. **Immutable Creation Timestamps & Identity**: `createdAt` cannot be modified after creation; `updatedAt` must equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Anonymous Booking Read**: Unauthenticated `get(/bookings/bk_1001)` -> DENIED.
2. **Anonymous Booking List Scrape**: Unauthenticated `list(/bookings)` -> DENIED.
3. **Signed-In Non-Admin Booking Scrape**: Authenticated non-admin `list(/bookings)` -> DENIED.
4. **Unverified Email Admin Spoof**: Token with `email: "prathamkumar1703@gmail.com"`, `email_verified: false` writing `/eventConfig/main` -> DENIED.
5. **Privilege Escalation (Self-Admin Write)**: Signed-in non-admin writing `/admins/{uid}` with `{ role: "ADMIN" }` -> DENIED.
6. **Shadow Field Injection on Category**: Admin writing `/ticketCategories/vip` with extra ghost field `{ isHacked: true }` -> DENIED.
7. **Price Tampering by Public User**: Public user updating `/ticketCategories/vip` `{ priceInr: 1 }` -> DENIED.
8. **Direct Ticket Forgery**: Signed-in non-admin creating `/tickets/tkt_999` `{ status: "VALID" }` -> DENIED.
9. **ID Poisoning Attack**: Writing `/ticketCategories/../../etc/passwd` or 500-char ID -> DENIED (`isValidId()`).
10. **Denial-of-Wallet Oversized String**: Admin or user writing `description` > 2000 chars or `benefits` array > 10 items -> DENIED.
11. **Temporal Spoofing**: Creating `/bookings/bk_1` with backdated `createdAt` != `request.time` -> DENIED.
12. **Terminal Ticket Reuse**: Updating `/tickets/tkt_1` from `status: "USED"` back to `status: "VALID"` without admin override -> DENIED.
