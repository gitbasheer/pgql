import { gql } from '@apollo/client';

// vnext-dashboard hooks with template interpolation
export const useVentureData = () => {
  const GET_VENTURE_QUERY = gql`
    query GetVentureData($ventureId: ID!) {
      venture(id: $ventureId) {
        id
        name
        ${additionalFields ? `
          settings {
            theme
            analytics
          }
        ` : ''}
        projects {
          id
          name
          status
          ${includeMetrics ? 'metrics { views conversions }' : ''}
        }
      }
    }
  `;
  
  return { GET_VENTURE_QUERY };
};

export const useOfferGraphMutation = () => {
  const UPDATE_OFFER = gql`
    mutation UpdateOffer($offerId: ID!, $data: OfferInput!) {
      updateOffer(id: $offerId, data: $data) {
        id
        title
        price
        ${includeAnalytics ? 'analytics { clicks conversions }' : ''}
      }
    }
  `;
  
  return { UPDATE_OFFER };
};

// Template variable with conditional logic
const additionalFields = process.env.NODE_ENV === 'development';
const includeMetrics = true;
const includeAnalytics = false;