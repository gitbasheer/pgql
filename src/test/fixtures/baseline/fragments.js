import { profileInfinityStoneFragment } from './profileFragments.js';

// TODO: Update product graph to use a computed field for properties.businessName
export const projectsFragment = `
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

export const userCustomerTypeFragment = `
  customerType
  customerTypeAttributes {
    isCoreInvestor
  }
`;

export const websitesFragment = `
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

export const userFragmentProjectCounts = `
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

export const ventureFragmentProjectGroups = `
 fragment ventureProjectGroupsField on Venture {
  projects {
    group
  }
 }
`;

/**
 * GQL fragment including venture profile and logo data.
 * @const {string} ventureFragment Query fragment to fetch all venture data.
 */
export const ventureFragment = `
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
  ${projectsFragment}
}`;

export const domainProductFragment = `
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

// NOTE(bfojas): this contains two fragments. One for fetching only the aiOnboarded field
// and one for fetching all the data. For the venture the user is currently in, we fetch all the data.
// For all other ventures, we only fetch the aiOnboarded field.
export const ventureISDataFieldsFragment = `
  fragment ventureInfinityStoneDataFields on Venture {
    id
    assetContainerId
    logoUrl
    isAAP @experimentalOptIn
    profile {
    ${profileInfinityStoneFragment}
      metadata {
        createdAt
        updatedAt
      }
      name
    }
    ${projectsFragment}
  }
`;

export const ventureInfinityStoneFragment = `
 ${ventureISDataFieldsFragment}

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
   ${projectsFragment}
 }
`;

/**
 * GQL fragment excluding venture full profile and logo data.
 * profile only includes the aiOnboarded check
 * @const {string} ventureFragment Query fragment to fetch all venture data.
 */
export const ventureFragmentWithoutProfile = `
fragment ventureFields on Venture {
  id
  logoUrl
  ${projectsFragment}
  profile {
    aapOnboarded
    aiOnboarded
  }
}
`;
