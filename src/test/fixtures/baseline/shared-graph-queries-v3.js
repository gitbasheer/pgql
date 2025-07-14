const { gql } = require('@apollo/client/core');

const {
  userFragmentProjectCounts,
  ventureFragment,
  ventureFragmentWithoutProfile,
  ventureISDataFieldsFragment,
  userCustomerTypeFragment,
  domainProductFragment
} = require('./fragments');


const { queryNames } = require('./queryNames');

export const getAllVenturesQuery = (options = {}) => {
  const allVenturesQuery = gql`
      ${ options.enableVentureProfileData ? ventureFragment : ventureFragmentWithoutProfile }
      query ${queryNames.allV1} {
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
          ${userFragmentProjectCounts}
        }
      }
    `;
  return allVenturesQuery;
};

const getQueryForVentureId = () => {
  const query = gql`
      ${ ventureFragment }
      query ${queryNames.byIdV3}($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          ...ventureFields
        }
      }
    `;
  return query;
};

const getQueryForDomainName = () => {
  const query = gql`
      ${ ventureFragment }
      query ${queryNames.byDomainV3}($domainName: String!) {
        venture: ventureByDomainName(domainName: $domainName) {
          ...ventureFields
        }
      }
    `;
  return query;
};

const getQueryForAiroVentureId = () => {
  const query = gql`
      ${ ventureISDataFieldsFragment }
      query ${queryNames.byIdV3Airo}($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          ...ventureInfinityStoneDataFields
        }
      }
    `;
  return query;
};

const getQueryForAiroDomainName = () => {
  const query = gql`
      ${ ventureISDataFieldsFragment }
      query ${queryNames.byDomainV3Airo}($domainName: String!) {
        venture: ventureByDomainName(domainName: $domainName) {
          ...ventureInfinityStoneDataFields
        }
      }
    `;
  return query;
};

export const getVentureQueryBasedOnParams = (ventureId, options) => {
  const airoEnabled = options.isAiroMarket;

  if (airoEnabled) {
    return ventureId ? getQueryForAiroVentureId() : getQueryForAiroDomainName();
  }

  return ventureId ? getQueryForVentureId() : getQueryForDomainName();
};

export const getUserQuery = () => {
  const query = gql`
      query ${queryNames.userV3} {
        user {
          ${userCustomerTypeFragment}
          ${userFragmentProjectCounts}
        }
      }
    `;
  return query;
};

export const getUserVenturesIdsQuery = () => {
  return gql`
    query ${queryNames.userV3} {
      user {
        ventures {
          id
        }
      }
    }
  `;
};

export const getClientSideVenturesQuery = () => {
  const query = gql`
      ${ ventureISDataFieldsFragment }
      query ${queryNames.clientSideV3} {
        user {
          ventures {
            ...ventureInfinityStoneDataFields
          }
        }
      }
    `;
  return query;
};

export const getClientUserAccountInfoQuery = () => {
  const query = gql`
      query GetUserAccountInfo {
        user {
          email
          customerId
          contact {
            nameFirst
            nameLast
            phoneWork
            phoneHome
            phoneMobile
          }
        }
      }
    `;
  return query;
};

export const getWebsiteDataQuery = () => {
  const query = gql`
      query GetUserWebsiteData($websiteId: UUID!) {
        website(websiteId: $websiteId) {
          data
        }
      }
    `;
  return query;
};

export const getAamcUserPreferencesQuery = () => {
  const query = gql`
    query GetAamcUserPreferences($ventureId: String!) {
      aamcUserPreferences(ventureId: $ventureId) @experimentalOptIn {
        ventureId
        emailOptedIn
        smsOptedIn
        modifiedTime
        creationTime
      }
    }
  `;
  return query;
};

/* eslint-disable-next-line id-length */
export const getClientSideVentureDomainQuery = () => {
  const query = gql`
    ${domainProductFragment}
    query getVentureDomainInfo($ventureId: UUID!) {
      venture(ventureId: $ventureId) {
        ...domainProductFields
      }
    }
  `;
  return query;
};

export const getAAPDomainSuccessPollQuery = () => {
  return gql`
    query ${queryNames.aapDomainSuccessPoll}($ventureId: UUID) {
      venture: ventureNode(ventureId: $ventureId) {
        projects {
          edges {
            node {
              group
              product {
                ... on DomainProduct {
                  domainName
                }
                ... on WebsiteProduct {
                  properties
                }
              }
            }
          }
        }
      }
    }
  `;
};

export const getAAPRenewalPollQuery = () => {
  return gql`
    query ${queryNames.aapRenewalSuccessPoll} ($ventureId: UUID) {
      venture: ventureNode(ventureId: $ventureId) {
        projects {
          edges {
            node {
              subscription {
                entitlements {
                  status
                }
              }
              group
            }
          }
        }
      }
    }
  `;
};

export const getAAPEmailClaimPollQuery = () => {
  return gql`
    query ${queryNames.aapEmailClaimPoll} ($ventureId: UUID) {
      venture: ventureNode(ventureId: $ventureId) {
        projects {
          edges {
            node {
              group
              domain
            }
          }
        }
      }
    }
  `;
};

export const getAiroPlusEntitlementQuery = () => {
  return gql`
    query GetAiroPlusEntitlement {
      projects {
        edges {
          node {
            group
            subscription {
              entitlements {
                status
              }
            }
            venture {
              id
            }
          }
        }
      }
    }
  `;
};



export const getVentureSpendGroupByVenture = () => {
  return gql`
    query getEstimatedSpendGroup($ventureId: UUID!) {
      venture: ventureNode(ventureId: $ventureId) {
        estimatedSpendGroupUSDAnnualized
      }
    }
  `;
};



export const getVentureSpendGroupByDomain = () => {
  return gql`
    query VentureSpendGroupByDomain($domainName: String) {
      venture: ventureNode(domainName: $domainName) {
        estimatedSpendGroupUSDAnnualized
      }
    }
  `;
};

export const getVentureSpendGroupByAccount = () => {
  return gql`
    query VentureSpendGroupByAccountId($entitlementId: String!) {
      projectNode(entitlementId: $entitlementId) {
        venture {
          estimatedSpendGroupUSDAnnualized
        }
      }
    }
  `;
};

export const getSpendGroupBasedOnParams = (ventureId) => {
  return ventureId ? getVentureSpendGroupByVenture() : getVentureSpendGroupByDomain();
};
