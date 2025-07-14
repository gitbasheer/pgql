/* eslint-disable id-length */
const { gql } = require('@apollo/client/core');
const {
  userFragmentProjectCounts,
  ventureFragment,
  ventureFragmentWithoutProfile
} = require('./fragments');
const { queryNames } = require('./queryNames');

/**
 * Build Venture By ventureId Query
 *
 * Lookup Venture Home data using a ventureId.
 *
 * @param {object} options Contextual options for the query builder.
 * @const {object} ventureByVentureIdQuery An Apollo Client query object.
 * @returns {object} The Apollo Client query object.
 */
export const getVentureByIdQuery = (options = {}) => {
  let fragment = ventureFragmentWithoutProfile;
  if (options.enableVentureProfileData) {
    fragment = ventureFragment;
  }
  // The fragment here is what ultimately defines "ventureFields"
  return gql`
      ${ fragment }
      query ${queryNames.byIdV2}($ventureId: UUID!) {
        user {
          ventures {
            id
            projects {
              group
              status
            }
          }
          ${userFragmentProjectCounts}
        }
        venture(ventureId: $ventureId) { ...ventureFields }
      }
    `;
};

export const  getVentureSkeletonQuery = () => {
  return gql`
      query ${queryNames.skeleton} {
        user {
          ventures {
            id
            projects {
              group
              status
              product {
                type
              }
            }
          }
          ${userFragmentProjectCounts}
        }
      }
    `;
};

export const getVentureByDomainNameQuery = (options = {}) => {
  let fragment = ventureFragmentWithoutProfile;
  if (options.enableVentureProfileData) {
    fragment = ventureFragment;
  }
  const ventureByDomainNameQuery = gql`
      ${ fragment  }
      query ${queryNames.byDomainV2}($domainName: String!) {
        user {
          ventures {
            id
            projects {
              group
              status
            }
          }
          ${userFragmentProjectCounts}
        }
        venture: ventureByDomainName(domainName: $domainName) { ...ventureFields }

      }
    `;
  return ventureByDomainNameQuery;
};

export const getQueryBasedOnParams = (ventureId, options = {}) => {
  return ventureId ? getVentureByIdQuery(options) : getVentureByDomainNameQuery(options);
};
