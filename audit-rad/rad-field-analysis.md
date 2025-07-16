# RAD Synthesizer Analysis Report

## Summary

- Total Synthesizers: 144
- Unique Fields: 102
- Entity Types: mktgasst, o365, uce, vnextgraph, wsbvnext

### Complexity Distribution

- simple: 106
- medium: 32
- complex: 6

## Most Used Fields

- `accountId`: 120 times
- `type`: 100 times
- `id`: 71 times
- `entitlementData`: 37 times
- `websiteType`: 32 times
- `features.published`: 20 times
- `wsbvnext.id`: 19 times
- `wsbvnext.type`: 19 times
- `features.widgets`: 18 times
- `wsbvnext.accountId`: 16 times
- `billing.commitment`: 15 times
- `wsbvnext.customerIntentions`: 15 times
- `mktgasst.id`: 12 times
- `mktgasst.type`: 12 times
- `features.planType`: 12 times
- `account.paymentStatus`: 11 times
- `customerIntentions`: 9 times
- `entitlements.current`: 9 times
- `commerce.productCount`: 8 times
- `appointments.serviceCount`: 7 times

## Common Data Access Patterns

### Authentication

- `accountId`: 120 times
- `wsbvnext.accountId`: 16 times
- `vnextAccount.shopperId`: 1 times
- `account.planType`: 1 times
- `wsbvnext.accountCreationListingId`: 1 times

### Billing

- `billing.commitment`: 15 times
- `account.paymentStatus`: 11 times
- `billing.termType`: 2 times
- `billing.autoRenew`: 2 times
- `ola.online_payment.status`: 1 times

### Features

- `features.published`: 20 times
- `features.widgets`: 18 times
- `features.planType`: 12 times
- `features.facebook.pageId`: 7 times
- `wsbvnext.features`: 5 times

### Entitlements

- `entitlementData`: 37 times
- `entitlements.current`: 9 times
- `entitlements.current.commerce`: 4 times
- `entitlements.current.blog`: 2 times
- `entitlements.current.appointments`: 2 times

### Social_Media

- `social.lastFacebookPost`: 5 times
- `social.lastInstagramPost`: 2 times
- `ola.facebook_booking.status`: 1 times

### Commerce

- `commerce.productCount`: 8 times
- `links.olsAddProducts`: 4 times
- `links.olsMarketplace`: 3 times
- `ols.setup_status`: 2 times
- `ols.marketplace_data`: 2 times

### Appointments

- `appointments.serviceCount`: 7 times
- `appointments.status`: 6 times
- `ola.calendar_sync.status`: 2 times
- `ola.account.has_business_address`: 1 times
- `ola.notifications.c1_sms`: 1 times

## Field Access Variations

Fields accessed in different ways:

### billing

- `vnextAccount.billing.termType`
- `vnextAccount.billing.commitment`
- `vnextAccount.billing.autoRenew`

### entitlements.current

- `entitlementData.current.conversations`
- `entitlementData.current[`
- `entitlementData.current.blog`
- `entitlementData.current.commerce`
- `entitlementData.current.appointments`
- `entitlementData.current`
