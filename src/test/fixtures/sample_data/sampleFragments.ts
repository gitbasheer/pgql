/** @fileoverview Consolidated sample fragments for testing - removes redundancy */

// Base fragments - building blocks
export const BILLING_FRAGMENT = `
  billing {
    id
    plan
  }
`;

export const DNS_FRAGMENT = `
  dns {
    hostingProvider
    emailProvider
    hosting_ip
    email_ip
  }
`;

export const SUBSCRIPTION_FRAGMENT = `
  subscription {
    id
    autoRenew
    canBeRenewed
    commonName
    offerPlan
    paidThroughDate
    productName
    status
    entitlements {
      status
      prePurchaseKeyMap {
        custom_data {
          dify_website
        }
      }
    }
  }
`;

// Product type fragments
export const DOMAIN_PRODUCT_FRAGMENT = `
  ...on DomainProduct {
    ${DNS_FRAGMENT}
    isListedForSaleByOwner
    domainName
    hasAutoRenew
    expirationDate
    estimatedValue
    dangerousProtectionPlan
    dangerousIsPrivate
    dangerousHasProtectedRegistration
    renewalPrice {
      listPrice
      message
      salePrice
      years
    }
  }
`;

export const EXTERNAL_PRODUCT_FRAGMENT = `
  ...on ExternalProduct {
    type
    entitlementsBlob
    planType
    status
    properties
    ${BILLING_FRAGMENT}
  }
`;

export const WEBSITE_PRODUCT_FRAGMENT = `
  ...on WebsiteProduct {
    type
    entitlementsBlob
    domainName
    businessName
    status
    isPublished
    planType
    properties
    data
    createDate
    homepageId
    options
    websiteSessionStats {
      last12Months
    }
    ${BILLING_FRAGMENT}
    backgroundImage
  }
`;

export const WORDPRESS_PRODUCT_FRAGMENT = `
  ...on WordpressProduct {
    accountStatus
    id
    maxSites
    sites {
      blogTitle
      siteUid
      manageWpSiteId
      cName
      ipAddress
      status
      published
      sslCertificateId
      entity {
        features {
          isDomainAttached
          domain
        }
      }
    }
  }
`;

export const ALL_ACCESS_PASS_PRODUCT_FRAGMENT = `
  ... on AllAccessPassProduct {
    domainCreditAvailable
  }
`;

// Consolidated project fragment
export const PROJECT_FRAGMENT = `
projects {
  id
  product {
    id
    ${DOMAIN_PRODUCT_FRAGMENT}
    ${EXTERNAL_PRODUCT_FRAGMENT}
    ${WEBSITE_PRODUCT_FRAGMENT}
    ${WORDPRESS_PRODUCT_FRAGMENT}
    ${ALL_ACCESS_PASS_PRODUCT_FRAGMENT}
  }
  group
  created
  status
  ${BILLING_FRAGMENT}
  accessed
  domain
  domainUnicode
  domainPunycode
  ${SUBSCRIPTION_FRAGMENT}
}
`;

export const USER_CUSTOMER_TYPE_FRAGMENT = `
  customerType
  customerTypeAttributes {
    isCoreInvestor
  }
`;

// Simplified website fragment (use WEBSITE_PRODUCT_FRAGMENT instead)
export const WEBSITES_FRAGMENT = WEBSITE_PRODUCT_FRAGMENT;

export const USER_FRAGMENT_PROJECT_COUNTS = `
  projectCounts (groups:[
    domain
    gdpayments
    olstore
    productivity
    qsc
    shield
    sslcert
    sslmanage
    vnext
    woosaas
    wordpress
    wst7
  ])
`;

// Profile fragments
export const PROFILE_METADATA_FRAGMENT = `
  metadata {
    createdAt
    updatedAt
  }
`;

export const PROFILE_BASE_FRAGMENT = `
  aapOnboarded
  aiOnboarded
  lastVisited
  numVisits
  name
  ${PROFILE_METADATA_FRAGMENT}
`;

// Consolidated venture fragments
export const VENTURE_PROJECT_GROUPS_FRAGMENT = `
 fragment ventureProjectGroupsField on Venture {
  projects {
    group
  }
 }
`;

export const VENTURE_BASE_FRAGMENT = `
fragment ventureFields on Venture {
  id
  assetContainerId
  logoUrl
  profile {
    ${PROFILE_BASE_FRAGMENT}
  }
  ${PROJECT_FRAGMENT}
}`;

export const RGBA_FRAGMENT = `
  r
  g
  b
  a
`;

export const HSLA_FRAGMENT = `
  h
  s
  l
  a
`;

export const COLOR_TYPES_FRAGMENT = `
  hex
  rgba {
    ${RGBA_FRAGMENT}
  }
  rgbaNorm {
    ${RGBA_FRAGMENT}
  }
  hsla {
    ${HSLA_FRAGMENT}
  }
  hslaNorm {
    ${HSLA_FRAGMENT}
  }
`;

export const COLOR_FRAGMENT = `
  accentColor {
    ${COLOR_TYPES_FRAGMENT}
  }
  backgroundColor {
    ${COLOR_TYPES_FRAGMENT}
  }
  primaryTextColor {
    ${COLOR_TYPES_FRAGMENT}
  }
  secondaryTextColor {
    ${COLOR_TYPES_FRAGMENT}
  }
  iconColor {
    ${COLOR_TYPES_FRAGMENT}
  }
  primaryColorPalette {
    ${COLOR_TYPES_FRAGMENT}
  }
  accentColorPalette {
    ${COLOR_TYPES_FRAGMENT}
  }
`;

export const VENTURE_INFERRED_FRAGMENT = `
  inferred {
    name
    vertical
    personalityKeywords
    businessStyles
    tagLines
    description
    websiteNeedsStore
    websiteNeedsAppointments
    fullWebsiteHeadline
    fullWebsiteSubhead
    fullWebsiteCTA
    logoUrl
    photoKeywords
    photoKeywordPhrases
    status {
      logosRendered
    }
    brands {
      businessStyle
      logos {
        id
        width
        height
        imageUrl
        template
        projectSpecUri
      }
      primaryText
      secondaryText
      primaryFont {
        type
      }
      secondaryFont {
        type
      }
      icon {
        ... on InferredBrandURLIcon {
          url
        }
        ... on InferredBrandFlaticonIcon {
          thumbnailUrl
        }
      }
      colors {
        ${COLOR_FRAGMENT}
      }
      titleFont {
        ... on InferredBrandStudioFont {
          family
        }
      }
      bodyFont {
        ... on InferredBrandStudioFont {
          family
        }
      }
    }
  }
`;

export const PROFILE_INFINITY_STONE_FRAGMENT = `
  ${VENTURE_INFERRED_FRAGMENT}
  aapOnboarded
  aiOnboarded
  category
  lastVisited
  numVisits
`;

// Enhanced venture fragments
export const VENTURE_INFINITY_STONE_FRAGMENT = `
  fragment ventureInfinityStoneDataFields on Venture {
    id
    assetContainerId
    logoUrl
    isAAP @experimentalOptIn
    profile {
      ${PROFILE_INFINITY_STONE_FRAGMENT}
      ${PROFILE_METADATA_FRAGMENT}
      name
    }
    ${PROJECT_FRAGMENT}
  }
`;

export const VENTURE_MINIMAL_FRAGMENT = `
fragment ventureMinimal on Venture {
  id
  logoUrl
  profile {
    aapOnboarded
    aiOnboarded
  }
  ${PROJECT_FRAGMENT}
}
`;