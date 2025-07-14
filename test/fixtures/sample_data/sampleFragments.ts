/** @fileoverview Sample fragments converted from data/sample_data for testing */

export const PROJECT_FRAGMENT = `
projects {
  id
  product {
    id
    ...on DomainProduct {
      dns {
        hostingProvider
        emailProvider
        hosting_ip
        email_ip
      }
      isListedForSaleByOwner
    }
    ...on ExternalProduct {
      type
      entitlementsBlob
      planType
      status
      properties
      billing {
        id
      }
    }
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
      billing {
        id
      }
      backgroundImage
    }
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
    ... on AllAccessPassProduct {
      domainCreditAvailable
    }
  }
  group
  created
  status
  billing {
    id
    plan
  }
  accessed
  domain
  domainUnicode
  domainPunycode
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
}
`;

export const USER_CUSTOMER_TYPE_FRAGMENT = `
  customerType
  customerTypeAttributes {
    isCoreInvestor
  }
`;

export const WEBSITES_FRAGMENT = `
    ...on WebsiteProduct {
      entitlementsBlob
      createDate
      homepageId
      domainName
      businessName
      status
      isPublished
      planType
      properties
      options
      billing {
        id
      }
    }
`;

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

export const VENTURE_FRAGMENT_PROJECT_GROUPS = `
 fragment ventureProjectGroupsField on Venture {
  projects {
    group
  }
 }
`;

export const VENTURE_FRAGMENT = `
fragment ventureFields on Venture {
  id
  assetContainerId
  logoUrl
  profile {
    aapOnboarded
    aiOnboarded
    lastVisited
    metadata {
      createdAt
      updatedAt
    }
    name
    numVisits
  }
  ${PROJECT_FRAGMENT}
}`;

export const DOMAIN_PRODUCT_FRAGMENT = `
fragment domainProductFields on Venture {
  projects {
    product {
      ...on DomainProduct {
        id
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
    }
  }
}
`;

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

export const VENTURE_IS_DATA_FIELDS_FRAGMENT = `
  fragment ventureInfinityStoneDataFields on Venture {
    id
    assetContainerId
    logoUrl
    isAAP @experimentalOptIn
    profile {
    ${PROFILE_INFINITY_STONE_FRAGMENT}
      metadata {
        createdAt
        updatedAt
      }
      name
    }
    ${PROJECT_FRAGMENT}
  }
`;

export const VENTURE_INFINITY_STONE_FRAGMENT = `
 ${VENTURE_IS_DATA_FIELDS_FRAGMENT}

 fragment ventureIsInfinityStoneFields on Venture {
   id
   assetContainerId
   logoUrl
   profile {
    aapOnboarded
    aiOnboarded
    metadata {
      createdAt
      updatedAt
    }
    name
   }
   ${PROJECT_FRAGMENT}
 }
`;

export const VENTURE_FRAGMENT_WITHOUT_PROFILE = `
fragment ventureFields on Venture {
  id
  logoUrl
  ${PROJECT_FRAGMENT}
  profile {
    aapOnboarded
    aiOnboarded
  }
}
`;