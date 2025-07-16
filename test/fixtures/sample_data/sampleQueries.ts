/** @fileoverview Sample queries converted from data/sample_data for testing - uses consolidated fragments */

import { gql } from '@apollo/client/core';
import {
  PROJECT_FRAGMENT,
  VENTURE_BASE_FRAGMENT,
  VENTURE_INFINITY_STONE_FRAGMENT,
  PROFILE_INFINITY_STONE_FRAGMENT
} from './sampleFragments.js';

export const SAMPLE_QUERY_NAMES = {
  byIdV1: 'getVentureHomeDataByVentureIdDashboard',
  allV1: 'getVentureHomeDataAllDashboard',
  byDomainV1: 'getVentureHomeDataByDomainNameDashboard',
  byIdV2: 'getVentureHomeDataByVentureIdDashboardV2',
  skeleton: 'getVentureSkeleton',
  byDomainV2: 'getVentureHomeDataByDomainNameDashboardV2',
  byIdV3: 'getVentureHomeDataByVentureIdDashboardV3',
  byDomainV3: 'getVentureHomeDataByDomainNameDashboardV3',
  byIdV3Airo: 'getVentureHomeDataByVentureIdDashboardV3Airo',
  byDomainV3Airo: 'getVentureHomeDataByDomainNameDashboardV3Airo',
  userV3: 'getUserDataDashboardV3',
  userVenturesIdsV3: 'getUserVenturesIdsDashboardV3',
  clientSideV3: 'getClientSideDataDashboardV3',
  aapDomainSuccessPoll: 'getAAPDomainSuccessPoll',
  aapRenewalSuccessPoll: 'getAAPRenewalSuccessPoll',
  aapEmailClaimPoll: 'getAAPEmailClaimPoll'
};

export const SAMPLE_GET_ALL_VENTURES_QUERY = gql`
  ${VENTURE_BASE_FRAGMENT}

  query ${SAMPLE_QUERY_NAMES.allV1} {
    user {
      ventures {
        ...ventureFields
        profile {
          name
          aapOnboarded
          aiOnboarded
          metadata {
            createdAt
            updatedAt
          }
        }
      }
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
    }
  }
`;

export const SAMPLE_SINGLE_VENTURE_QUERY = gql`
  ${VENTURE_INFINITY_STONE_FRAGMENT}

  query singleVentureByVentureId($ventureId: UUID!) {
    venture(ventureId: $ventureId) {
      ...ventureInfinityStoneDataFields
    }
  }
`;

export const SAMPLE_VENTURE_STATES_QUERY = gql`
  query ventureStates($ventureId: UUID!) {
    venture(ventureId: $ventureId) {
      id
      projects {
        id
        status
        group
      }
    }
  }
`;

export const SAMPLE_OFFERS_QUERY = gql`
  query FindUnifiedBillDetails(
    $subscriptionId: String
    $entitlementId: String
    $productFilter: String
    $productQuery: String
    $discountCodes: String
    $enableOptimizationFlow: Boolean
    $iscCode: String
    $currency: String
    $market: String
  ) {
    me {
      customerInfo {
        market
      }
    }
    transitions(
      subscriptionId: $subscriptionId
      entitlementId: $entitlementId
      filter: $productFilter
      query: $productQuery
      discountCodes: $discountCodes
      enableOptimizationFlow: $enableOptimizationFlow
      iscCode: $iscCode
      currency: $currency
      market: $market
    ) {
      subscriptionId
      paidThroughDate
      revision
      displayName
      billing {
        commitment
        status
        autoRenew
      }
      planTerm
      numberOfTerms
      pfid
      resellerId
      source
      offers {
        id
        catalogInstanceKey
        storefrontUri
        isCurrent
        term {
          unit
          count
        }
        price {
          discountCode
          currency
          numeric {
            listing {
              perTerm {
                full
                discounted
                renewal
                renewalDiscounted
              }
              perMonth {
                full
                discounted
                renewal
                renewalDiscounted
              }
              perYear {
                full
                discounted
                renewal
                renewalDiscounted
              }
            }
          }
          formatted {
            listing {
              perTerm {
                full
                discounted
                renewal
                renewalDiscounted
              }
              perMonth {
                full
                discounted
                renewal
                renewalDiscounted
              }
              perYear {
                full
                discounted
                renewal
                renewalDiscounted
              }
            }
          }
        }
        capabilities {
          categoryOrder
          capabilities {
            category
            icon
            id
            isBold
            showOnGrid
            showOnMobile
            showOnTiles
            text
            value
          }
        }
        display {
          name
          usage
        }
        plans {
          id
          productType
          productFamily
          display {
            fullName
            intendedUse
            popularity
            longDescription
            marketingContent {
              title
              value
              tooltip
              emphasize
            }
          }
          productFamily
          featureValues {
            featureId
            dataType
            booleanValue
            stringValue
            numericValue
          }
        }
        availableAddOns {
          name
          type
          localizedName
          quantifiable
          values {
            enable
            state
            discountPrice
            offerPrice
            discountPriceFormatted
            offerPriceFormatted
            taxTotal
            feeTotal
            ratingsKey
            value
            quantifiableValue
            localizedName
          }
        }
      }
    }
  }
`;

export const SAMPLE_MODIFY_BASKET_MUTATION = gql`
  mutation ModifyBasketWithOptions($data: ModifyBasketWithOptionsInput!) {
    modifyBasketWithOptions(data: $data)
  }
`;

export const SAMPLE_VARIABLES = {
  singleVenture: {
    ventureId: 'a5a1a68d-cfe8-4649-8763-71ad64d62306'
  },
  offerQuery: {
    subscriptionId: 'test-subscription-123',
    entitlementId: 'test-entitlement-456',
    productFilter: 'hosting',
    productQuery: 'website',
    discountCodes: 'SAVE20',
    enableOptimizationFlow: true,
    iscCode: 'USD',
    currency: 'USD',
    market: 'US'
  },
  modifyBasket: {
    data: {
      subscriptionId: 'test-subscription-123',
      items: [
        {
          productId: 'hosting-pro',
          quantity: 1,
          duration: 12
        }
      ]
    }
  }
};