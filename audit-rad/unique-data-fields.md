# Complete Unique Data Fields Used by RAD Synthesizers

## Summary

- **Total Unique Data Fields:** 96
- **Total Synthesizers:** 113

## Top 20 Most Commonly Used Data

| Data Field                  | Used By  | Category                   | Type         | Description                                          |
| --------------------------- | -------- | -------------------------- | ------------ | ---------------------------------------------------- |
| `account.id`                | 106 RADs | Identity & Core Data       | identifier   | Unique identifier for the customer account           |
| `entity.id`                 | 57 RADs  | Identity & Core Data       | identifier   | Unique identifier for the entity (context-dependent) |
| `entitlements.all`          | 37 RADs  | Entitlements & Permissions | string       | Complete entitlement information                     |
| `entity.type`               | 37 RADs  | Identity & Core Data       | enum         | Type of entity (wsbvnext, mktgasst, etc.)            |
| `websiteType`               | 32 RADs  | Other                      | enum         | Other data field                                     |
| `customer.intentions`       | 24 RADs  | Customer Data              | array/object | Customer intent/goal information                     |
| `website.isPublished`       | 20 RADs  | Website Configuration      | boolean      | Whether the website is published and live            |
| `website.widgets`           | 18 RADs  | Website Configuration      | identifier   | List of enabled website widgets/sections             |
| `billing.commitment`        | 15 RADs  | Billing & Payments         | string       | Billing commitment period (monthly, annual, etc.)    |
| `account.planType`          | 13 RADs  | Identity & Core Data       | enum         | Current subscription plan type                       |
| `billing.paymentStatus`     | 11 RADs  | Billing & Payments         | enum         | Current payment status                               |
| `entitlements.current`      | 9 RADs   | Entitlements & Permissions | string       | Currently active entitlements                        |
| `commerce.productCount`     | 8 RADs   | E-commerce                 | number       | Number of products in online store                   |
| `appointments.serviceCount` | 7 RADs   | Appointments & Services    | number       | Number of bookable services                          |
| `social.facebookPageId`     | 7 RADs   | Marketing & Social         | identifier   | Connected Facebook page ID                           |
| `appointments.status`       | 6 RADs   | Appointments & Services    | enum         | Appointments & Services data field                   |
| `features`                  | 6 RADs   | Other                      | string       | Other data field                                     |
| `email.subscriberCount`     | 5 RADs   | Marketing & Social         | number       | Number of email subscribers                          |
| `social.lastFacebookPost`   | 5 RADs   | Marketing & Social         | string       | Date of most recent Facebook post                    |
| `social.facebookConnected`  | 5 RADs   | Marketing & Social         | boolean      | Whether Facebook is connected                        |

## Identity & Core Data

**5 unique data fields** used by synthesizers:

### `account.id`

- **Description:** Unique identifier for the customer account
- **Data Type:** identifier
- **Used by:** 106 synthesizers
- **Access Variations:** 2 different ways
  - `accountId`
  - `wsbvnext.accountId`

### `entity.id`

- **Description:** Unique identifier for the entity (context-dependent)
- **Data Type:** identifier
- **Used by:** 57 synthesizers
- **Access Variations:** 3 different ways
  - `id`
  - `mktgasst.id`
  - `wsbvnext.id`

### `entity.type`

- **Description:** Type of entity (wsbvnext, mktgasst, etc.)
- **Data Type:** enum
- **Used by:** 37 synthesizers
- **Access Variations:** 3 different ways
  - `mktgasst.type`
  - `type`
  - `wsbvnext.type`

### `account.planType`

- **Description:** Current subscription plan type
- **Data Type:** enum
- **Used by:** 13 synthesizers
- **Access Variations:** 2 different ways
  - `account.planType`
  - `features.planType`

### `account.shopperId`

- **Description:** GoDaddy shopper ID for the account
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddFBBookNowOLA-ylid4ZUsF

## Other

**23 unique data fields** used by synthesizers:

### `websiteType`

- **Description:** Other data field
- **Data Type:** enum
- **Used by:** 32 synthesizers

### `features`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 6 synthesizers
- **Access Variations:** 2 different ways
  - `features`
  - `wsbvnext.features`

### `content.blogPosts`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 4 synthesizers
- **Used in:**
  - Task-DoFirstBlog-I0rcrov4y
  - Task-ReadBlogging-uQzCHoLKn
  - Task-SetupOLS-K4Ke0BhVr
  - Task-WriteAnotherBlog-GrO7TMHpK

### `sev.hasActivated`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-DoStartSEO-JjpaiNG8e
  - Task-OptimizeSEOKeywords-6Rzv6USG0

### `features.facebook.isConnected`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-UpdateHours-5TBU5si9t
  - Task-UploadSocialPhotosV2-nKEwhEHr5

### `features.gmb.hasGMBPublished`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-UpdateHours-5TBU5si9t
  - Task-UploadSocialPhotosV2-nKEwhEHr5

### `features.yelp.hasYelpPublished`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-UpdateHours-5TBU5si9t
  - Task-UploadSocialPhotosV2-nKEwhEHr5

### `features.published`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 2 synthesizers
- **Used in:**
  - Guidance-GetNoticedLocal-1-QqudDQntn
  - Task-DIFY-Tier0RAC-8OkZvUlrI

### `features.planType`

- **Description:** Other data field
- **Data Type:** enum
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-ConnectInstagram-OJFRzVo1V
  - Task-DIFY-Tier0RAC-8OkZvUlrI

### `]`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-GoDaddyConversations-LoeR11kT~

### `entitlementData.current.website`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-DIFY-Tier0RAC-8OkZvUlrI

### `accountCreationListingId`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Guidance-C19EmailMarketing-uUD7sJSSw

### `features.yelp.hasYelpApprovedClaim`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-UploadSocialPhotosV2-nKEwhEHr5

### `exports`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SellInPerson-pl9N8kzKb

### `entitlementData.current`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-ConnectInstagram-OJFRzVo1V

### `features.instagram.isConnected`

- **Description:** Other data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-ConnectInstagram-OJFRzVo1V

### `o365.id`

- **Description:** Other data field
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `o365.shopper.shopperId`

- **Description:** Other data field
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `o365.states.activated`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `features.id`

- **Description:** Other data field
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `features.websiteType`

- **Description:** Other data field
- **Data Type:** enum
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `vnextAccount.billing.commitment`

- **Description:** Other data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

### `vnextAccount.shopperId`

- **Description:** Other data field
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - SetupO365-9S2CsmNNg

## Entitlements & Permissions

**9 unique data fields** used by synthesizers:

### `entitlements.all`

- **Description:** Complete entitlement information
- **Data Type:** string
- **Used by:** 37 synthesizers

### `entitlements.current`

- **Description:** Currently active entitlements
- **Data Type:** string
- **Used by:** 9 synthesizers

### `entitlements.current.commerce`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 4 synthesizers
- **Used in:**
  - Task-AbandonedCartOn-UdVHbmFQ\_
  - Task-Add10MoreProducts-LHwR9aqcU
  - Task-AddMoreProducts-wLwoZl_J6
  - Task-SetupOLS-K4Ke0BhVr

### `entitlements.current.blog`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-ReadBlogging-uQzCHoLKn
  - Task-WriteAnotherBlog-GrO7TMHpK

### `entitlements.current.appointments`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-AddMoreServicesOLA-ggonWjB4r
  - Task-WriteAnotherBlog-GrO7TMHpK

### `entitlements.transitionable`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddFBBookNowOLA-ylid4ZUsF

### `entitlements.current.conversations`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-GoDaddyConversations-LoeR11kT~

### `entitlements.current[`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-GoDaddyConversations-LoeR11kT~

### `entitlements.used`

- **Description:** Entitlements & Permissions data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-HolidayTips-T1iPmqWfx

## Website Configuration

**11 unique data fields** used by synthesizers:

### `website.isPublished`

- **Description:** Whether the website is published and live
- **Data Type:** boolean
- **Used by:** 20 synthesizers

### `website.widgets`

- **Description:** List of enabled website widgets/sections
- **Data Type:** identifier
- **Used by:** 18 synthesizers

### `website.businessCategoryGroup`

- **Description:** Website Configuration data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-DoPostToFacebook-Holiday-0Saq7QDFp
  - Task-PostOLSProductFB-Composer-2hJM7wm~n

### `website.businessCategory`

- **Description:** Website Configuration data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-BoostFacebookPost-PLnyt8eLO
  - Task-DIYSocialAds-2Rz6HLNBa

### `website.hasCustomLogo`

- **Description:** Whether user has uploaded a custom logo
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddLogo-6pWJNvpKc

### `website.gmb.hasSubmittedToOneSpace`

- **Description:** Website Configuration data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-CreateGMB-rVIKdnkfH

### `website.gmb.hasGMBOnlineBusiness`

- **Description:** Website Configuration data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-CreateGMB-rVIKdnkfH

### `website.domainName`

- **Description:** Primary domain name for the website
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddCustomDomain-wMt3BHgAV

### `website.customDomain`

- **Description:** Custom domain name if configured
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddCustomDomain-wMt3BHgAV

### `website.facebook.socialWidgetData.pageURL`

- **Description:** Website Configuration data field
- **Data Type:** identifier
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-ReadFBPractices-lhTLuFAXD

### `website.gmb.photos.counts`

- **Description:** Website Configuration data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-UploadGMBPhotos-1n8hDk6g7

## Marketing & Social

**11 unique data fields** used by synthesizers:

### `social.facebookPageId`

- **Description:** Connected Facebook page ID
- **Data Type:** identifier
- **Used by:** 7 synthesizers

### `email.subscriberCount`

- **Description:** Number of email subscribers
- **Data Type:** number
- **Used by:** 5 synthesizers
- **Used in:**
  - Task-AddGEMSubscribers-gHLTYfjQb
  - Task-DoEmailGEMCampaign-WJmqcTWuG
  - Task-EmailSubscriberWebformC19-ZmFDG9FcG
  - Task-FirstEmailCampaignC19-nrezDgjU~
  - Task-ImportSubscribersC19-zmAmJk57a

### `social.lastFacebookPost`

- **Description:** Date of most recent Facebook post
- **Data Type:** string
- **Used by:** 5 synthesizers
- **Used in:**
  - Task-BoostFacebookPost-PLnyt8eLO
  - Task-DoPostToFacebook-Composer-6vaOpXKQY
  - Task-DoPostToFacebook-Holiday-0Saq7QDFp
  - Task-PostOLSProductFB-Composer-2hJM7wm~n
  - Task-PromoteAppointmentService-EBVqroHvQ

### `social.facebookConnected`

- **Description:** Whether Facebook is connected
- **Data Type:** boolean
- **Used by:** 5 synthesizers
- **Used in:**
  - Task-AddPhotoGallery-n61NU0wb7
  - Task-AddWidgetSocialLink-4CAcVnOxs
  - Task-CreateFacebook-lJxPzgZ0\_
  - Task-DIYSocialAds-2Rz6HLNBa
  - Task-FacebookAds-Direct-skYt7juRJ

### `social.googleBusinessPublished`

- **Description:** Whether Google Business profile is published
- **Data Type:** boolean
- **Used by:** 4 synthesizers
- **Used in:**
  - Task-AddPhotoGallery-n61NU0wb7
  - Task-AddWidgetSocialLink-4CAcVnOxs
  - Task-PostOLSProductGMB-Composer-WX9wdWSpf
  - Task-UploadGMBPhotos-1n8hDk6g7

### `social.yelpPublished`

- **Description:** Whether Yelp listing is published
- **Data Type:** boolean
- **Used by:** 3 synthesizers
- **Used in:**
  - Task-AddPhotoGallery-n61NU0wb7
  - Task-AddWidgetSocialLink-4CAcVnOxs
  - Task-UploadYelpPhotos-Mnf6UqWHp

### `email.hasSent`

- **Description:** Marketing & Social data field
- **Data Type:** boolean
- **Used by:** 3 synthesizers
- **Used in:**
  - Task-DoEmailGEMCampaign-WJmqcTWuG
  - Task-EmailSubscriberWebformC19-ZmFDG9FcG
  - Task-FirstEmailCampaignC19-nrezDgjU~

### `social.lastInstagramPost`

- **Description:** Date of most recent Instagram post
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-DoPostToFacebook-Composer-6vaOpXKQY
  - Task-PromoteAppointmentService-EBVqroHvQ

### `social.yelpCompleted`

- **Description:** Marketing & Social data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-CreateYelp-GA_Og2~US
  - Task-LaunchYelpAd-ttZI44tTV

### `social.googleBusinessStarted`

- **Description:** Marketing & Social data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-CreateGMB-rVIKdnkfH

### `social.googleBusinessLocation`

- **Description:** Marketing & Social data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-PostOLSProductGMB-Composer-WX9wdWSpf

## Billing & Payments

**4 unique data fields** used by synthesizers:

### `billing.commitment`

- **Description:** Billing commitment period (monthly, annual, etc.)
- **Data Type:** string
- **Used by:** 15 synthesizers

### `billing.paymentStatus`

- **Description:** Current payment status
- **Data Type:** enum
- **Used by:** 11 synthesizers

### `billing.termType`

- **Description:** Billing term type
- **Data Type:** enum
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-Upgrade-GetSEO-2LAl6Jf6~
  - Task-Upgrade-RemoveAds-ZsVan1Rs~

### `billing.autoRenew`

- **Description:** Whether auto-renewal is enabled
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-Upgrade-GetSEO-2LAl6Jf6~
  - Task-Upgrade-RemoveAds-ZsVan1Rs~

## Navigation Links

**15 unique data fields** used by synthesizers:

### `links.olsAddProducts`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 4 synthesizers
- **Used in:**
  - Task-Add10MoreProducts-LHwR9aqcU
  - Task-AddMoreProducts-wLwoZl_J6
  - Task-AddProducts-cNIUx3M29
  - Task-AddProductsLocal-H089y5Ocg

### `links.emailCampaign`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 4 synthesizers
- **Used in:**
  - Task-DoEmailGEMCampaign-WJmqcTWuG
  - Task-DoFirstBlog-I0rcrov4y
  - Task-EmailSubscriberWebformC19-ZmFDG9FcG
  - Task-FirstEmailCampaignC19-nrezDgjU~

### `links.olsMarketplace`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 3 synthesizers
- **Used in:**
  - Task-AddMarketplaceProducts-28gG3LLu5
  - Task-AddMarketplaces-ooFFpJyQH
  - Task-ConnectGoogleChannel-Srmwrh1J~

### `links.emailSubscribers`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-AddGEMSubscribers-gHLTYfjQb
  - Task-ImportSubscribersC19-zmAmJk57a

### `links.sev`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-DoStartSEO-JjpaiNG8e
  - Task-OptimizeSEOKeywords-6Rzv6USG0

### `links.yelpLaunch`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-CreateYelp-GA_Og2~US
  - Task-LaunchYelpAd-ttZI44tTV

### `links.websiteEditor`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-PublishWebsiteV2-v_r5yAuLN
  - Task-RemovePlaceHolderText-K_QK3NSYl

### `links.blog`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddBlog-D8U9r02OD

### `links.gmbLaunch`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-CreateGMB-rVIKdnkfH

### `links.olsAddShipping`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SetupOLSShipping-qsUxHaA42

### `links.websitePreview`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-PublishWebsiteV2-v_r5yAuLN

### `links.gmbLaunchPhotos`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-UploadGMBPhotos-1n8hDk6g7

### `links.fbPageCreate`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-CreateFacebook-lJxPzgZ0\_

### `links.fbAdsDirect`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-FacebookAds-Direct-skYt7juRJ

### `links.olsAddPayment`

- **Description:** Navigation Links data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SetupOLSPayment-Yra6mJk4y

## Customer Data

**2 unique data fields** used by synthesizers:

### `customer.intentions`

- **Description:** Customer intent/goal information
- **Data Type:** array/object
- **Used by:** 24 synthesizers
- **Access Variations:** 2 different ways
  - `customerIntentions`
  - `wsbvnext.customerIntentions`

### `customer.contacts`

- **Description:** Customer contact list information
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddImportContacts-jfCpiF5eE

## Appointments & Services

**7 unique data fields** used by synthesizers:

### `appointments.serviceCount`

- **Description:** Number of bookable services
- **Data Type:** number
- **Used by:** 7 synthesizers

### `appointments.status`

- **Description:** Appointments & Services data field
- **Data Type:** enum
- **Used by:** 6 synthesizers

### `appointments.calendarSyncStatus`

- **Description:** Calendar synchronization status
- **Data Type:** enum
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-OLACalendarSyncV2-16YkByamt
  - Task-SetupOLANotifications-zen_KPiqs

### `appointments.paymentStatus`

- **Description:** Online payment setup status
- **Data Type:** enum
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SetupOLAPaymentsV2-jc8Qp_Caw

### `appointments.facebookBookingStatus`

- **Description:** Facebook appointment booking status
- **Data Type:** enum
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddFBBookNowOLA-ylid4ZUsF

### `appointments.hasBusinessAddress`

- **Description:** Appointments & Services data field
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-Add-Your-Business-Info-6txejSc1E

### `appointments.smsNotifications`

- **Description:** Appointments & Services data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SetupOLANotifications-zen_KPiqs

## E-commerce

**8 unique data fields** used by synthesizers:

### `commerce.productCount`

- **Description:** Number of products in online store
- **Data Type:** number
- **Used by:** 8 synthesizers

### `commerce.setupStatus`

- **Description:** Store setup completion status
- **Data Type:** enum
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-AddMoreProducts-wLwoZl_J6
  - Task-SetupOLS-K4Ke0BhVr

### `commerce.marketplaces`

- **Description:** Connected marketplace information
- **Data Type:** string
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-AddMarketplaceProducts-28gG3LLu5
  - Task-AddMarketplaces-ooFFpJyQH

### `commerce.storeStatus`

- **Description:** Current store operational status
- **Data Type:** enum
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AddMoreProducts-wLwoZl_J6

### `commerce.productReviewsEnabled`

- **Description:** Whether product reviews are enabled
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-ProductReviewsOn-JvWllTdA4

### `commerce.abandonedCartEnabled`

- **Description:** Whether abandoned cart recovery is enabled
- **Data Type:** boolean
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-AbandonedCartOn-UdVHbmFQ\_

### `commerce.featuredProducts`

- **Description:** E-commerce data field
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-PostOLSProductGMB-Composer-WX9wdWSpf

### `commerce.paymentMethods`

- **Description:** Available payment methods
- **Data Type:** string
- **Used by:** 1 synthesizers
- **Used in:**
  - Task-SetupOLSPayment-Yra6mJk4y

## Request Context

**1 unique data fields** used by synthesizers:

### `context.ventureId`

- **Description:** Current venture/project ID
- **Data Type:** identifier
- **Used by:** 2 synthesizers
- **Used in:**
  - Task-Upgrade-GetSEO-2LAl6Jf6~
  - Task-Upgrade-RemoveAds-ZsVan1Rs~

# Data Overlap Analysis

## Synthesizers with Similar Data Requirements

Top synthesizer pairs that share significant data requirements:

### Task-AddPhotoGallery-n61NU0wb7 ↔ Task-AddWidgetSocialLink-4CAcVnOxs

- **Similarity:** 100.0%
- **Common Fields:** 10
- **Shared Data:**
  - `account.id`
  - `account.planType`
  - `entity.id`
  - `entity.type`
  - `social.facebookConnected`
  - ... and 5 more

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-Appointments-1-Cs1c8jdv9

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-ProductsAppts-1-FCmeBLtjA

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-AppointmentsLocal-1-N~uMwJlnV

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-ProductsGoal-1-DwsETrlPT

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-ProductsApptsLocal-1-ys9Eh_zXN

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-Local-2-jDYwffkHC

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-GetNoticed-2-ODfCE4BVy ↔ Guidance-ProductsLocal-1-qH9XwU_6p

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Task-CompleteSocialAd-HSkUrAAq2 ↔ DIFY-RequestSocialPost-FkIUvG_jS

- **Similarity:** 100.0%
- **Common Fields:** 3
- **Shared Data:**
  - `account.id`
  - `entitlements.all`
  - `website.isPublished`

### Task-CompleteSocialAd-HSkUrAAq2 ↔ placeholderguidancegroup-9mpCbd9Sn

- **Similarity:** 100.0%
- **Common Fields:** 3
- **Shared Data:**
  - `account.id`
  - `entitlements.all`
  - `website.isPublished`

### Task-AddProductsLocal-H089y5Ocg ↔ Task-AddProducts-cNIUx3M29

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `commerce.productCount`
  - `entitlements.all`
  - `links.olsAddProducts`

### Task-PostOLSProductFB-Composer-2hJM7wm~n ↔ Task-DoPostToFacebook-Holiday-0Saq7QDFp

- **Similarity:** 100.0%
- **Common Fields:** 7
- **Shared Data:**
  - `account.id`
  - `entitlements.current`
  - `entity.id`
  - `entity.type`
  - `social.facebookPageId`
  - ... and 2 more

### Guidance-DmFull-Social-1-h7zbOhdMB ↔ Guidance-DmFull-SocialLocalEmail-1-gqOdjJjQu

- **Similarity:** 100.0%
- **Common Fields:** 5
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`
  - `features`

### Guidance-DmFull-Social-1-h7zbOhdMB ↔ Guidance-DmFull-SocialLocal-1-ADqrYOoKy

- **Similarity:** 100.0%
- **Common Fields:** 5
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`
  - `features`

### Guidance-DmFull-Social-1-h7zbOhdMB ↔ Guidance-DmFull-SocialEmail-1-GmfspIsuO

- **Similarity:** 100.0%
- **Common Fields:** 5
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`
  - `features`

### DIFY-RequestSocialPost-FkIUvG_jS ↔ placeholderguidancegroup-9mpCbd9Sn

- **Similarity:** 100.0%
- **Common Fields:** 3
- **Shared Data:**
  - `account.id`
  - `entitlements.all`
  - `website.isPublished`

### Guidance-Appointments-1-Cs1c8jdv9 ↔ Guidance-ProductsAppts-1-FCmeBLtjA

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-Appointments-1-Cs1c8jdv9 ↔ Guidance-AppointmentsLocal-1-N~uMwJlnV

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-Appointments-1-Cs1c8jdv9 ↔ Guidance-ProductsGoal-1-DwsETrlPT

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`

### Guidance-Appointments-1-Cs1c8jdv9 ↔ Guidance-ProductsApptsLocal-1-ys9Eh_zXN

- **Similarity:** 100.0%
- **Common Fields:** 4
- **Shared Data:**
  - `account.id`
  - `customer.intentions`
  - `entity.id`
  - `entity.type`
