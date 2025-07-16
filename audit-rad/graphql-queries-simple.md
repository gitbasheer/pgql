# RADset Synthesizers -- WAM General

## Task-AddGEMSubscribers-gHLTYfjQb

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'gem.subscriberCount',
        'links.addSubscribers',
      ]),
    );
```

## Task-Upgrade-RemoveAds-ZsVan1Rs~

```javascript
(profile) => {
  const { request: { query: { ventureId, appLocation } = {} } = {} } = profile || {};

  let tabPath = 'venture/upgrade/plan';

  const entityData = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.websiteType',
        'vnextAccount.billing.termType',
        'vnextAccount.billing.autoRenew',
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'vnextAccount.ventureId',
      ]),
    );

  if (appLocation && appLocation === 'uvh-dashboard-website') {
    tabPath = 'venture/website/upgrade/plan';
  }

  if (ventureId) {
    return [
      {
        ...entityData[0],
        ventureId,
        tabPath,
      },
    ];
  } else {
    return [
      {
        ...entityData[0],
        ventureId: entityData[0].vnextAccount.ventureId,
        tabPath,
      },
    ];
  }

  return [];
};
```

## Task-AddMoreProducts-wLwoZl_J6

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current.commerce',
        'vnextAccount.billing.commitment',
        'features.published',
        'links.olsAddProducts',
        'ols.products.count',
        'ols.setup_status',
        'ols.store_status',
      ]),
    );
```

## Task-SubscriptionsCouponOrInsights-EfdGoWY3R

```javascript
(profile) => {
  const site = profile.entities.find(
    ({ type = '', features: { websiteType } = {} }) =>
      type === 'wsbvnext' && websiteType === 'gocentral',
  );

  if (site) {
    const widgets = site.features?.widgets || [];
    const accountId = site.accountId;
    const path = widgets.includes('SUBSCRIBE') ? 'editsection' : 'addsection';
    return [
      {
        id: site.id,
        accountId: site.accountId,
        type: site.type,
        path,
      },
    ];
  }

  return [];
};
```

## Task-PromoteAppointmentService-EBVqroHvQ

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.websiteType',
        'features.widgets',
        'ola.service.total',
        'gem.lastIgPostDate',
        'gem.lastFbPostDate',
      ]),
    );
```

## Task-ReadBlogging-uQzCHoLKn

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'blog',
        'entitlementData.current.blog',
        'features.published',
        'features.websiteType',
      ]),
    );
```

## Task-DoEmailGEMCampaign-Social-Tile-R9MtcarCi

```javascript
(profile) => {
  return [];
};
```

## Guidance-Local-2-jDYwffkHC

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-AddHeaderImage-GQZD61oxC

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.published',
        'features.widgets',
        'features.websiteType',
      ]),
    );
```

## Guidance-GetNoticed-2-ODfCE4BVy

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-AddLogo-6pWJNvpKc

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['accountId', 'features.userAddedLogo', 'features.websiteType']),
    );
```

## Task-AddShopLocal-PUuCmUg60

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'accountId',
        'customerIntentions',
        'entitlementData',
        'features.widgets',
        'features.websiteType',
        'ols.products.count',
      ]),
    );
```

## Task-ChatLearnMore-HKQ4ObbyT

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-SetupOLAPaymentsV2-jc8Qp_Caw

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'customerIntentions',
        'ola.online_payment.status',
      ]),
    );
```

## Task-UploadYelpPhotos-Mnf6UqWHp

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['accountId', 'id', 'features.yelp.hasYelpPublished']));
```

## Task-DoPostToFacebook-Holiday-Sales-Tile-VUO1ImXfw

```javascript
(profile) => {
  return [];
};
```

## Task-AddVideoWidget-gnR7xUtCf

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['id', 'accountId', 'features.widgets', 'features.websiteType']),
    );
```

## Task-DIFYPhotoShoot-0BcOP9tUR

```javascript
(profile) => [{ type: 'none', id: 'always' }];
```

## Guidance-Appointments-1-Cs1c8jdv9

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-ConnectSocialChannels-Z3k1TBAVy

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-WaysToSell-VTk695TTb

```javascript
(profile) => {
  const { request: { query: { ventureId } = {} } = {} } = profile || {};
  if (ventureId) {
    return [
      {
        id: 'none',
        type: 'always show',
        ventureId,
      },
    ];
  }

  return [];
};
```

## Task-FinishOLASetup-lojlsh6yk

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'ola.account.status']));
```

## Task-AddOLAV2-WlLowz8wT

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'customerIntentions',
        'entitlementData',
        'features.widgets',
        'features.websiteType',
      ]),
    );
```

## Task-AddFBBookNowOLA-ylid4ZUsF

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'accountId',
        'type',
        'entitlementData.current',
        'entitlementData.transitionable',
        'features.published',
        'features.websiteType',
        'vnextAccount.shopperId',
        'ola.service.total',
        'ola.account.status',
        'ola.facebook_booking.status',
      ]),
    );
```

## Guidance-DmFull-SocialEmail-1-GmfspIsuO

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
      'wsbvnext.features',
    ]);
  });
```

## Task-DIFY-n6n0grUBR

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId']));
```

## Task-DoFirstBlog-I0rcrov4y

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'id',
        'blog',
        'entitlementData.current',
        'features.websiteType',
        'links.composeCampaign',
      ]),
    );
```

## Task-AddWidgetContent-WgaarO6ht

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'features.widgets', 'features.websiteType']));
```

## Task-Add10MoreProducts-LHwR9aqcU

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['accountId', 'entitlementData.current.commerce', 'links.olsAddProducts']),
    );
```

## Task-AddBlog-D8U9r02OD

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.websiteType',
        'features.widgets',
        'links.blog',
      ]),
    );
```

## Task-GoDaddyConversations-LoeR11kT~

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'accountId',
        'entitlementData.current.conversations',
        'entitlementData.current["conversations.lite"]',
      ]),
    );
```

## Task-DoStartSEO-JjpaiNG8e

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'sev.hasActivated',
        'links.sev',
        'vnextAccount.billing.commitment',
      ]),
    );
```

## Task-CustomizeChatWidget-5BSAO5cvy

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-DoEmailGEMCampaign-Sales-Tile-qdWVe5QuU

```javascript
(profile) => {
  return [];
};
```

## Task-AddMarketplaceProducts-Orders-Tile-zaOMcPW9~

```javascript
(profile) => {
  return [];
};
```

## Task-AddWidgetContactUs-VFIVqWNNF

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.published',
        'features.widgets',
        'features.websiteType',
      ]),
    );
```

## SetupO365-Orders-Tile-dO765dxiP

```javascript
(profile) => {
  return [];
};
```

## Task-ConnectSocialMediaChannels-Xr6oFBp~w

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-AddAppointments-4PBTM~evZ

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'customerIntentions', 'ola.service.total']));
```

## Task-PoyntSetup-sGURMs9~y

```javascript
(profile) => {
  const uceEntity = profile.entities.find((entity) => entity.type === 'uce');

  const siteWithCommerce = profile.entities.find(
    ({ type = '', id = '', entitlementData: { current: { ucc } = {} } = {} }) => {
      const ols = uceEntity?.features?.ols;
      const status = ols?.status;
      const isProvisioned = id && status && status !== 'NOT_PROVISIONED';
      return type === 'wsbvnext' && isProvisioned;
    },
  );

  if (siteWithCommerce) {
    const {
      features: {
        payments: {
          metadata: {
            processing_account: {
              businessId,
              paymentsEnabled,
              riskDecision,
              applicationStatus,
            } = {},
          } = {},
        } = {},
      } = {},
    } = uceEntity || {};

    const isCompleted = !!(
      businessId ||
      paymentsEnabled ||
      (riskDecision && riskDecision !== 'PENDING') ||
      (applicationStatus && applicationStatus !== 'INCOMPLETE')
    );

    return [
      {
        id: siteWithCommerce.id,
        type: siteWithCommerce.type,
        poyntLink: siteWithCommerce.links?.poyntSetup,
        isCompleted,
      },
    ];
  }

  return [];
};
```

## Task-CreateGMB-rVIKdnkfH

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.gmb.hasGMBStarted',
        'features.gmb.hasSubmittedToOneSpace',
        'features.gmb.hasGMBOnlineBusiness',
        'links.gmbLaunch',
        'type',
        'wsbvnext.customerIntentions',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.websiteType',
        'type',
        'features.planType',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-DoPostToFacebook-Composer-Sales-Tile-9GxHrujAX

```javascript
(profile) => {
  return [];
};
```

## Task-EnableWebsiteChatbot-oGxPiCrpD

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-AddCustomDomain-wMt3BHgAV

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'domainName',
        'features.externalDomainName',
        'features.websiteType',
        'vnextAccount.billing.commitment',
      ]),
    );
```

## Task-MO-Social-Post-Create-1dxk25myc

```javascript
(profile) => {
  const vnextgraphEntity = profile.entities.find((e) => e.type === 'vnextgraph');
  const wsbvnextEntity = profile.entities.find((e) => e.type === 'wsbvnext');

  return [
    {
      id: wsbvnextEntity.id,
      type: wsbvnextEntity.type,
      ventureId: wsbvnextEntity.vnextAccount.ventureId,
    },
  ];
};
```

## Task-DoFirstBlog-Social-Views-Tile-uCdixXJyf

```javascript
(profile) => {
  return [];
};
```

## Task-CreateYelp-GA_Og2~US

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, ['id', 'features.yelp.hasCompletedYelpFlow', 'links.yelpLaunch', 'type']),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.websiteType',
        'type',
        'features.planType',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-AddImportContacts-jfCpiF5eE

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'entitlementData', 'contacts']));
```

## Task-AddCustomDomain-Orders-Tile-of2MFbapb

```javascript
(profile) => {
  return [];
};
```

## Task-WriteAnotherBlog-GrO7TMHpK

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'blog',
        'entitlementData.current.appointments',
        'entitlementData.current.blog',
        'features.published',
        'features.websiteType',
        'ola.account.status',
        'ola.service.total',
      ]),
    );
```

## Task-RemovePlaceHolderText-K_QK3NSYl

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'links.editorDirect', 'customerIntentions']));
```

## Guidance-ProductsLocal-1-qH9XwU_6p

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-ConnectSocialAccounts-leCIpNDXg

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId']));
```

## Task-DoStartSEO-Orders-Tile-NN2qogtkq

```javascript
(profile) => {
  return [];
};
```

## Task-Add-Your-Business-Info-6txejSc1E

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.websiteType',
        'ola.service.total',
        'ola.account.has_business_address',
      ]),
    );
```

## Task-AboutSection-0ZQxVpFjU

```javascript
(profile) => {
  const site = profile.entities.find(
    ({ type = '', features: { websiteType } = {} }) =>
      type === 'wsbvnext' && websiteType === 'gocentral',
  );

  if (site) {
    const widgets = site.features?.widgets || [];
    const accountId = site.accountId;
    const path = widgets.includes('ABOUT') ? 'editsection' : 'addsection';
    return [
      {
        id: site.id,
        accountId: site.accountId,
        type: site.type,
        path,
      },
    ];
  }

  return [];
};
```

## Task-AddProducts-cNIUx3M29

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'links.olsAddProducts',
        'ols.products.count',
      ]),
    );
```

## Task-PostOLSProductFB-Composer-2hJM7wm~n

```javascript
(profile) => {
  const { request: { query: { appLocation, ventureId } = {} } = {} } = profile || {};

  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['id', 'features.facebook.pageId', 'type']));

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'gem.lastFbPostDate',
        'type',
        'features.businessCategoryGroup',
      ]),
    );

  const entities = joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );

  if (appLocation === 'uvh-dashboard' && ventureId && ventureId !== 'undefined') {
    return [
      {
        ...entities[0],
        appLocation,
        path: `/venture/composer/fb/product?ventureId=${ventureId}`,
        ventureId,
      },
    ];
  }
  return [
    {
      ...entities[0],
      appLocation,
      path: `/account/${entities[0].wsbvnext.accountId}/composer/fb/product`,
    },
  ];
};
```

## Task-HolidayTips-T1iPmqWfx

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.used',
        'features.published',
        'ols.products.count',
      ]),
    );
```

## Task-SetupOLANotifications-zen_KPiqs

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'accountId',
        'customerIntentions',
        'entitlementData',
        'ola.account.status',
        'ola.calendar_sync.status',
        'ola.notifications.c1_sms',
      ]),
    );
```

## Task-AddProducts-Sales-Tile-69y9MQduu

```javascript
(profile) => {
  return [];
};
```

## Task-GetMobileApp-EFZSm0_x0

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-BoostFacebookPost-PLnyt8eLO

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['id', 'type']));

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'features.businessCategory',
        'type',
        'gem.lastFbPostDate',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-ConnectEmail-X5r1RHNY7

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-OLACalendarSyncV2-16YkByamt

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'customerIntentions',
        'entitlementData',
        'ola.account.status',
        'ola.calendar_sync.status',
        'ola.service.total',
      ]),
    );
```

## Task-SetupOLA-bBvfbn~Fc

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.websiteType',
        'ola.service.total',
      ]),
    );
```

## Task-UpdateHours-5TBU5si9t

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'mktgasst.features.facebook.isConnected',
      'mktgasst.features.gmb.hasGMBPublished',
      'mktgasst.features.yelp.hasYelpPublished',
    ]);
  });
```

## Guidance-ProductsApptsLocal-1-ys9Eh_zXN

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-DoPostToFacebook-Holiday-Social-Tile-I1cIjNYqS

```javascript
(profile) => {
  return [];
};
```

## Task-DoEmailGEMCampaign-WJmqcTWuG

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'gem.hasSent',
        'gem.subscriberCount',
        'links.composeCampaign',
        'features.planType',
      ]),
    );
```

## Guidance-DmFull-Social-1-h7zbOhdMB

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
      'wsbvnext.features',
    ]);
  });
```

## Task-ConnectGoogleChannel-Srmwrh1J~

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'type',
        'features.published',
        'entitlementData.current',
        'ols.products.count',
        'links.olsMarketplace',
        'account.planType',
      ]),
    );
```

## placeholderguidancegroup-9mpCbd9Sn

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'features.published']));
```

## Task-AddPhotoGallery-n61NU0wb7

```javascript
(profile) => {
  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.widgets',
        'features.websiteType',
        'type',
        'features.planType',
      ]),
    );

  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.facebook.isConnected',
        'features.facebook.pageId',
        'features.gmb.hasGMBPublished',
        'features.yelp.hasYelpPublished',
        'type',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-Upgrade-GetSEO-2LAl6Jf6~

```javascript
(profile) => {
  const { request: { query: { ventureId, appLocation } = {} } = {} } = profile || {};

  let tabPath = 'venture/upgrade/plan';

  const entityData = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.websiteType',
        'vnextAccount.billing.termType',
        'vnextAccount.billing.autoRenew',
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'vnextAccount.ventureId',
      ]),
    );

  if (appLocation && appLocation === 'uvh-dashboard-website') {
    tabPath = 'venture/website/upgrade/plan';
  }

  if (ventureId) {
    return [
      {
        ...entityData[0],
        ventureId,
        tabPath,
      },
    ];
  } else {
    return [
      {
        ...entityData[0],
        ventureId: entityData[0].vnextAccount.ventureId,
        tabPath,
      },
    ];
  }

  return [];
};
```

## Task-PostOLSProductFB-Composer-Orders-Tile-QFdjNHOt7

```javascript
(profile) => {
  return [];
};
```

## Task-DIYSocialAds-Google-IxmbJyahQ

```javascript
(profile) => [{ type: 'none', id: 'always' }];
```

## Task-AddOLSv2-kR6RYmjhK

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'accountId',
        'customerIntentions',
        'entitlementData',
        'features.widgets',
        'features.websiteType',
        'ols.products.count',
      ]),
    );
```

## Task-ProductReviewsOn-JvWllTdA4

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'entitlementData',
        'ols.features_enabled.product_reviews',
      ]),
    );
```

## Task-AddDownloadWidget-UPZPuslFZ

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['id', 'accountId', 'features.widgets', 'features.websiteType']),
    );
```

## Task-DIFY-Tier0RAC-8OkZvUlrI

```javascript
(profile) =>
  joinEntities(profile.entities, (entity) => entity.type === 'wsbvnext').map((entity) =>
    entityPick(entity, [
      'wsbvnext.features.published',
      'id',
      'accountId',
      'wsbvnext.entitlementData.current.website',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.features.planType',
    ]),
  );
```

## Task-AddMoreServicesOLA-ggonWjB4r

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current.appointments',
        'vnextAccount.billing.commitment',
        'features.websiteType',
        'ola.account.status',
      ]),
    );
```

## Task-OptimizeSEOKeywords-6Rzv6USG0

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'sev.hasActivated',
        'links.sev',
        'vnextAccount.billing.commitment',
      ]),
    );
```

## Task-ReadFBPractices-lhTLuFAXD

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.facebook.pageId',
        'features.facebook.socialWidgetData.pageURL',
        'type',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'type']));

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Guidance-C19EmailMarketing-uUD7sJSSw

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
      'wsbvnext.features',
      'wsbvnext.accountCreationListingId',
    ]);
  });
```

## Task-SetupOLSShipping-qsUxHaA42

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'links.olsAddShipping']));
```

## Task-EmailSubscriberWebformC19-ZmFDG9FcG

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'gem.hasSent',
        'gem.subscriberCount',
        'links.composeCampaign',
        'features.planType',
      ]),
    );
```

## Task-BoostFacebookPost-Social-Views-Tile-5u6pHYGsK

```javascript
(profile) => {
  return [];
};
```

## SetupO365-Sales-Tile-E6JlwyIKx

```javascript
(profile) => {
  return [];
};
```

## Guidance-ProductsGoal-1-DwsETrlPT

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-DoPostToFacebook-Composer-Social-Tile-8b78ni1jS

```javascript
(profile) => {
  return [];
};
```

## Task-UploadSocialPhotosV2-nKEwhEHr5

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'mktgasst.features.facebook.isConnected',
      'mktgasst.features.gmb.hasGMBPublished',
      'mktgasst.features.yelp.hasYelpPublished',
      'mktgasst.features.yelp.hasYelpApprovedClaim',
      'wsbvnext.id',
      'wsbvnext.type',
    ]);
  });
```

## Task-AddAboutUs-liZueQkbU

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'features.widgets', 'features.websiteType']));
```

## Task-CustomizeWebChat-4kf2JuCK7

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-UploadImages-L1wNWevaM

```javascript
(profile) => {
  const site = profile.entities.find(
    ({ type = '', features: { websiteType } = {} }) =>
      type === 'wsbvnext' && websiteType === 'gocentral',
  );

  if (site) {
    const widgets = site.features?.widgets || [];
    const accountId = site.accountId;
    const path = widgets.includes('GALLERY') ? 'editsection' : 'addsection';
    return [
      {
        id: site.id,
        accountId: site.accountId,
        type: site.type,
        path,
      },
    ];
  }

  return [];
};
```

## Task-CompleteSocialAd-HSkUrAAq2

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'features.published']));
```

## Task-AddMarketplaces-ooFFpJyQH

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'accountId',
        'entitlementData',
        'links.olsMarketplace',
        'ols.marketplace_data',
        'ols.products.count',
        'vnextAccount.billing.commitment',
      ]),
    );
```

## Task-SetupOLS-K4Ke0BhVr

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'blog',
        'entitlementData.current.commerce',
        'ols.setup_status',
      ]),
    );
```

## Task-RequestSiteEdit-kcqHrV*C*

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.planType',
      ]),
    );
```

## Task-AddMarketplaces-Orders-Tile-tRAbYMbIA

```javascript
(profile) => {
  return [];
};
```

## Task-AddVideoWidget-Sales-Tile-cIt21E8k~

```javascript
(profile) => {
  return [];
};
```

## Guidance-GetNoticedLocal-1-QqudDQntn

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.features.published',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-ConnectGoogleChannel-Sales-Tile-azKISpnrT

```javascript
(profile) => {
  return [];
};
```

## Task-DIYSocialAds-Social-Views-Tile-6Ybg~ucB\_

```javascript
(profile) => {
  return [];
};
```

## Task-AddMenuWidget-62VEyEM1S

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['id', 'accountId', 'features.widgets', 'features.websiteType']),
    );
```

## Task-AddContactUs-y3Ex_bNsp

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-DoPostToFacebook-Holiday-0Saq7QDFp

```javascript
(profile) => {
  const { request: { query: { appLocation, ventureId } = {} } = {} } = profile || {};

  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['id', 'features.facebook.pageId', 'type']));

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'gem.lastFbPostDate',
        'type',
        'features.businessCategoryGroup',
      ]),
    );

  const entities = joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );

  if (appLocation === 'uvh-dashboard' && ventureId && ventureId !== 'undefined') {
    return [
      {
        ...entities[0],
        appLocation,
        path: `/venture/composer/over?ventureId=${ventureId}&overSearchTerm=holiday+season`,
        ventureId,
      },
    ];
  }

  return [
    {
      ...entities[0],
      appLocation,
      path: `/account/${entities[0].wsbvnext.accountId}/composer/over?overSearchTerm=holiday+season`,
    },
  ];
};
```

## Task-LaunchYelpAd-ttZI44tTV

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, ['id', 'features.yelp.hasCompletedYelpFlow', 'links.yelpLaunch', 'type']),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.websiteType',
        'type',
        'features.planType',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-PublishStore-EMHmxoxji

```javascript
(profile) => {
  const uceEntity = profile.entities.find((entity) => entity.type === 'uce');

  const siteWithCommerce = profile.entities.find(
    ({
      type = '',
      id = '',
      entitlementData: { current: { ucc } = {} } = {},
      customerIntentions: {
        'onlineStore.channel.ols': olsIntent,
        'onlineStore.channel.inPerson': inPersonIntent,
        preloaded: {
          'onlineStore.channel.ols': olsIntentPreloaded,
          'onlineStore.channel.inPerson': inPersonIntentPreloaded,
        } = {},
      } = {},
    }) => {
      const hasOLSIntent = olsIntent || olsIntentPreloaded;
      const hasInPersonIntent = inPersonIntent || inPersonIntentPreloaded;
      const ols = uceEntity?.features?.ols;
      const status = ols?.status;
      const isProvisioned = id && status && status !== 'NOT_PROVISIONED';
      const skipProvisionCheck = hasInPersonIntent && !hasOLSIntent;
      return type === 'wsbvnext' && (hasOLSIntent || (!skipProvisionCheck && isProvisioned));
    },
  );

  if (siteWithCommerce) {
    return [
      {
        id: siteWithCommerce.id,
        type: siteWithCommerce.type,
        websiteId: siteWithCommerce.id,
        features: {
          published: siteWithCommerce.features?.published,
        },
      },
    ];
  }

  return [];
};
```

## Task-ConnectSocialAccounts-leCIpNDXg(copy)-hhIvw3CG0

```javascript
(profile) => {
  return profile.entities
    .filter((entity) => entity.type === 'vnextgraph')
    .map((entity) => {
      const entitlements = entity.entitlementData?.current;

      const isCompleted =
        entitlements?.['socialMediaManager.fb.connect'] === true ||
        entitlements?.['socialMediaManager.gmb.connect'] === true ||
        entitlements?.['socialMediaManager.yelp.connect'] === true ||
        entitlements?.['socialMediaManager.instagram'] === true ||
        entitlements?.['socialMediaManager.twitter'] === true;

      return {
        type: entity.type,
        id: entity.data?.website?.id || '',
        accountId: entity.data?.website?.accountId || '',
        status: isCompleted ? 'completed' : 'incomplete',
        score: isCompleted ? 0 : 10,
        entitlements: entitlements,
      };
    });
};
```

## Task-SellInPerson-pl9N8kzKb

```javascript
module.exports = (profile) => {
  const uceEntity = profile.entities.find((entity) => entity.type === 'uce');

  const siteWithCommerce = profile.entities.find(
    ({ type = '', id = '', entitlementData: { current: { ucc } = {} } = {} }) => {
      const ols = uceEntity && uceEntity.features && uceEntity.features.ols;
      const status = ols && ols.status;
      const isProvisioned = id && status && status !== 'NOT_PROVISIONED';
      return type === 'wsbvnext' && isProvisioned;
    },
  );

  if (siteWithCommerce) {
    return [
      {
        id: siteWithCommerce.id,
        type: siteWithCommerce.type,
        websiteId: siteWithCommerce.id,
        commerceSellInPersonLink: siteWithCommerce?.links?.commerceSellInPerson,
        uceTerminals: uceEntity?.features?.payments?.metadata?.terminals,
      },
    ];
  }

  return [];
};
```

## Task-SetupOLSCoupons-2p9FxafXl

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'customerIntentions',
        'entitlementData',
        'features.published',
      ]),
    );
```

## Task-AbandonedCartOn-UdVHbmFQ\_

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'ols.features_enabled.abandoned_cart',
        'entitlementData.current.commerce',
      ]),
    );
```

## Task-PublishWebsiteV2-v_r5yAuLN

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'features.published',
        'features.websiteType',
        'links.preview',
        'links.editorDirect',
      ]),
    );
```

## Task-UploadGMBPhotos-1n8hDk6g7

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.gmb.hasGMBPublished',
        'features.gmb.photos.counts',
        'links.gmbLaunchPhotos',
        'type',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.websiteType',
        'type',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Guidance-AppointmentsLocal-1-N~uMwJlnV

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-CreateFacebook-lJxPzgZ0\_

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.facebook.isConnected',
        'features.facebook.pageId',
        'links.fbPageCreate',
        'type',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['accountId', 'entitlementData', 'type', 'features.planType']),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-HolidayTips-Sales-Tile-Hheu6jpl4

```javascript
(profile) => {
  return [];
};
```

## Task-ConnectInstagram-OJFRzVo1V

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.entitlementData.current',
      'mktgasst.features.instagram.isConnected',
      'wsbvnext.features.planType',
    ]);
  });
```

## Task-ImportSubscribersC19-zmAmJk57a

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'gem.subscriberCount',
        'links.addSubscribers',
        'id',
        'features.planType',
      ]),
    );
```

## Task-PostOLSProductGMB-Composer-WX9wdWSpf

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.gmb.hasGMBLocation',
        'features.gmb.hasGMBPublished',
        'type',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'entitlementData.current',
        'features.published',
        'ols.featured_products_with_images',
        'type',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## DIFY-RequestSocialPost-FkIUvG_jS

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'entitlementData', 'features.published']));
```

## Guidance-DmFull-SocialLocal-1-ADqrYOoKy

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
      'wsbvnext.features',
    ]);
  });
```

## Guidance-DmFull-SocialLocalEmail-1-gqOdjJjQu

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
      'wsbvnext.features',
    ]);
  });
```

## Guidance-ProductsAppts-1-FCmeBLtjA

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  ).map((entity) => {
    return entityPick(entity, [
      'mktgasst.id',
      'mktgasst.type',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.accountId',
      'wsbvnext.customerIntentions',
    ]);
  });
```

## Task-Marketing-Checklist-6YjLchphX

```javascript
(profile) => {
  const { request: { query: { ventureId } = {} } = {} } = profile || {};
  if (ventureId) {
    return [
      {
        id: 'none',
        type: 'always show',
        ventureId,
      },
    ];
  }

  return [];
};
```

## Task-AddMarketplaceProducts-28gG3LLu5

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'entitlementData',
        'links.olsMarketplace',
        'ols.marketplace_data',
      ]),
    );
```

## Task-FirstEmailCampaignC19-nrezDgjU~

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'gem.hasSent',
        'gem.subscriberCount',
        'links.composeCampaign',
        'features.planType',
      ]),
    );
```

## Task-FacebookAds-Direct-skYt7juRJ

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.facebook.isConnected',
        'features.facebook.pageId',
        'links.fbAdsDirect',
        'type',
      ]),
    );

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'features.published',
        'features.websiteType',
        'type',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-AddWidgetSocialLink-4CAcVnOxs

```javascript
(profile) => {
  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, ['accountId', 'features.widgets', 'features.websiteType', 'type']),
    );

  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) =>
      entityPick(entity, [
        'id',
        'features.facebook.isConnected',
        'features.facebook.pageId',
        'features.gmb.hasGMBPublished',
        'features.yelp.hasYelpPublished',
        'type',
        'features.planType',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## Task-DoPostToFacebook-Composer-6vaOpXKQY

```javascript
(profile) => {
  const { request: { query: { appLocation, ventureId } = {} } = {} } = profile || {};

  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['id', 'type']));

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'type',
        'gem.lastIgPostDate',
        'gem.lastFbPostDate',
        'features.planType',
      ]),
    );

  const entities = joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );

  if (appLocation === 'uvh-dashboard' && ventureId && ventureId !== 'undefined') {
    return [
      {
        ...entities[0],
        appLocation,
        path: `/venture/composer/fb/website?ventureId=${ventureId}`,
        ventureId,
      },
    ];
  }

  return [
    {
      ...entities[0],
      appLocation,
      path: `/account/${entities[0].wsbvnext.accountId}/composer/fb/website`,
    },
  ];
};
```

## Task-ConnectYourEmail-ydde1aa~\_

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-DIYSocialAds-2Rz6HLNBa

```javascript
(profile) => {
  const mktgasst = profile.entities
    .filter((entity) => entity.type === 'mktgasst')
    .map((entity) => entityPick(entity, ['id', 'type', 'features.facebook.isConnected']));

  const wsbVnext = profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'features.businessCategory',
        'type',
      ]),
    );

  return joinEntities(
    mktgasst,
    wsbVnext,
    (a, b) => a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId,
  );
};
```

## SetupO365-9S2CsmNNg

```javascript
(profile) =>
  joinEntities(
    profile.entities,
    profile.entities,
    (a, b) =>
      a.type === 'wsbvnext' &&
      b.type === 'o365' &&
      a?.vnextAccount?.shopperId === b?.shopper?.shopperId,
  ).map((entity) => {
    return entityPick(entity, [
      'o365.id',
      'o365.shopper.shopperId',
      'o365.states.activated',
      'wsbvnext.accountId',
      'wsbvnext.features.id',
      'wsbvnext.features.websiteType',
      'wsbvnext.id',
      'wsbvnext.type',
      'wsbvnext.vnextAccount.billing.commitment',
      'wsbvnext.vnextAccount.shopperId',
    ]);
  });
```

## Task-NeverMissMessage-civlq1Mso

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-CreateGMB-Appointments-Tile-DKBrslslz

```javascript
(profile) => {
  return [];
};
```

## Task-ContactSection-wbAdmNLvR

```javascript
(profile) => {
  const site = profile.entities.find(
    ({ type = '', features: { websiteType } = {} }) =>
      type === 'wsbvnext' && websiteType === 'gocentral',
  );

  if (site) {
    const widgets = site.features?.widgets || [];
    const accountId = site.accountId;
    const path = widgets.includes('CONTACT') ? 'editsection' : 'addsection';
    return [
      {
        id: site.id,
        accountId: site.accountId,
        type: site.type,
        path,
      },
    ];
  }

  return [];
};
```

## Task-AddProductsLocal-H089y5Ocg

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'accountId',
        'entitlementData',
        'links.olsAddProducts',
        'ols.products.count',
      ]),
    );
```

## Task-SetupOLSPayment-Yra6mJk4y

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) =>
      entityPick(entity, [
        'vnextAccount.account.paymentStatus',
        'vnextAccount.billing.commitment',
        'accountId',
        'entitlementData',
        'links.olsAddPayment',
        'ols.payment_methods.available',
      ]),
    );
```

## Task-HeaderCTAtoContact-\_ILcgYwDS

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['id', 'accountId']));
```

## Task-ChooseTheme-rAQz4cW5H

```javascript
(profile) =>
  profile.entities
    .filter((entity) => entity.type === 'wsbvnext')
    .map((entity) => entityPick(entity, ['accountId', 'features.websiteType']));
```

## Task-PublishWebsiteV2-Orders-Tile-Wqlujx1J3

```javascript
(profile) => {
  return [];
};
```

## Task-ExploreHub-aPyAmCbrm

```javascript
(profile) => {
  const uceEntity = profile.entities.find((entity) => entity.type === 'uce');

  const siteWithCommerce = profile.entities.find(
    ({ type = '', id = '', entitlementData: { current: { ucc } = {} } = {} }) => {
      const ols = uceEntity?.features?.ols;
      const status = ols?.status;
      const isProvisioned = id && status && status !== 'NOT_PROVISIONED';
      return type === 'wsbvnext' && isProvisioned;
    },
  );

  if (siteWithCommerce) {
    return [
      {
        id: siteWithCommerce.id,
        type: siteWithCommerce.type,
        commerceHubLink: siteWithCommerce.links?.commerceHub,
      },
    ];
  }

  return [];
};
```

## Task-ViewMySubscribers-TCLmO4CU3

```javascript
(profile) => {
  const site = profile.entities.find(
    ({ type = '', features: { websiteType } = {} }) =>
      type === 'wsbvnext' && websiteType === 'gocentral',
  );

  if (site) {
    const ventureId = site.vnextAccount?.ventureId;
    return [
      {
        id: ventureId,
        ventureId: ventureId,
        type: 'projects',
      },
    ];
  }

  return [
    {
      id: '0',
      type: 'error',
    },
  ];
};
```
