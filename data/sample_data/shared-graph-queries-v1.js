/* eslint-disable id-length */
const { gql } = require('@apollo/client/core');

const {
  userFragmentProjectCounts,
  ventureFragment,
  ventureFragmentWithoutProfile,
  ventureInfinityStoneFragment,
  ventureISDataFieldsFragment,
  websitesFragment,
  ventureFragmentProjectGroups,
  userCustomerTypeFragment
} = require('./fragments');

const { profileInfinityStoneFragment } = require('./profileFragments');

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

export const getVentureStatesQuery = () => {
  const allVenturesQuery = gql`
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
  return allVenturesQuery;
};

export const getQueryForSingleVenture = (ventureId, options = {}) => {
  const infinityStoneEnabled = options.infinityStoneExperimentOn;
  let fragment = ventureFragmentWithoutProfile;

  if (infinityStoneEnabled) {
    fragment = ventureISDataFieldsFragment;
  } else if (options.enableVentureProfileData) {
    fragment = ventureFragment;
  }

  const query = gql`
      ${fragment}
      query singleVentureByVentureId($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          ...${infinityStoneEnabled ? 'ventureInfinityStoneDataFields' : 'ventureFields'}
        }
      }
    `;
  return query;
};

export const getQueryForSingleVentureProjects = (ventureId, options = {}) => {
  const infinityStoneEnabled = options.infinityStoneExperimentOn;
  let fragment = ventureFragmentWithoutProfile;

  if (infinityStoneEnabled) {
    fragment = ventureFragmentProjectGroups;
  } else if (options.enableVentureProfileData) {
    fragment = ventureFragment;
  }

  const query = gql`
      ${fragment}
      query singleVentureByVentureId($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          ...${infinityStoneEnabled ? 'ventureProjectGroupsField' : 'ventureFields'}
        }
      }
    `;
  return query;
};

export const getQueryBasedOnParams = (ventureId, options = {}) => {
  const infinityStoneEnabled = options.infinityStoneExperimentOn;
  let fragment = ventureFragmentWithoutProfile;

  if (infinityStoneEnabled) {
    fragment = ventureInfinityStoneFragment;
  } else if (options.enableVentureProfileData) {
    fragment = ventureFragment;
  }

  const queryName = ventureId ? queryNames.byIdV1 : queryNames.byDomainV1;
  const queryArgs = ventureId ? '$ventureId: UUID!' : '$domainName: String!';
  const ventureQuery = ventureId ? 'venture' : 'venture: ventureByDomainName';
  const ventureArgs = ventureId ? 'ventureId: $ventureId' : 'domainName: $domainName';
  const query = gql`
      ${ fragment}
      query ${queryName}(${queryArgs}) {
        user {
          ${userCustomerTypeFragment}
          ventures {
            ...${infinityStoneEnabled ? 'ventureIsInfinityStoneFields' : 'ventureFields'}
          }
          ${userFragmentProjectCounts}
        }
        ${ventureQuery}(${ventureArgs}) {
          ...${infinityStoneEnabled ? 'ventureInfinityStoneDataFields' : 'ventureFields'}
        }
      }
    `;
  return query;
};

export const queryWebsitesFromEntitlement = () => {
  const projectByEntitlement = gql`
    query projectByEntitlement($entitlementId: String!) {
      product {
        id
        type
        ${websitesFragment}
      }
    }
  `;
  return projectByEntitlement;
};

export const queryWebsitesFromVentures = () => {
  const websitesQuery = gql`
    query allVentures {
      user {
        ventures {
          id
          logoUrl
          projects {
            product {
              id
              type
              ${websitesFragment}
            }
          }
        }
      }
    }
  `;
  return websitesQuery;
};

export const getInfinityStoneDataByVentureId = () => {
  const infinityStoneDataByVentureIdQuery = gql`
    query ventureInfinityStoneDataByVentureId ($ventureId: UUID!) {
      venture(ventureId: $ventureId) {
        profile {
          ${profileInfinityStoneFragment}
        }
      }
    }
  `;

  return infinityStoneDataByVentureIdQuery;
};

export const getIsInfinityStoneByVentureId  = () => {
  const isInfinityStoneByVentureIdQuery = gql`
    query ventureIsInfinityStoneByVentureId ($ventureId: UUID!) {
      venture(ventureId: $ventureId) {
        profile {
          aiOnboarded
        }
      }
    }
  `;

  return isInfinityStoneByVentureIdQuery;
};

export const getInfinityStoneDataByDomainName = () => {
  const infinityStoneDataByDomainQuery = gql`
    query ventureInfinityStoneDataByDomain ($ventureId: UUID!) {
      venture: ventureByDomainName(ventureId: $ventureId) {
        profile {
          ${profileInfinityStoneFragment}
        }
      }
    }
  `;

  return infinityStoneDataByDomainQuery;
};

export const queryIntentsFromVenture = () => {
  const intentsByVentureIdQuery = gql`
    query intentsByVenture ($ventureId: UUID!) {
      venture(ventureId: $ventureId) {
        intents
      }
    }
  `;

  return intentsByVentureIdQuery;
};
