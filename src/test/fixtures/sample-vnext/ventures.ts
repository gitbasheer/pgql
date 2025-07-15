import { gql } from '@apollo/client';

export const GET_VENTURE_BY_ID = gql`
  query GetVentureById($ventureId: UUID!) {
    venture(id: $ventureId) {
      id
      name
      profile {
        logoUrl
        description
      }
      projects {
        id
        domain
        status
      }
    }
  }
`;

export const GET_VENTURE_PROJECTS = gql`
  query GetVentureProjects($ventureId: UUID!, $limit: Int = 10) {
    venture(id: $ventureId) {
      id
      projects(limit: $limit) {
        id
        domain
        status
        product {
          type
          status
        }
      }
    }
  }
`;

export const GET_USER_VENTURES = gql`
  query GetUserVentures {
    user {
      id
      ventures {
        id
        name
        profile {
          logoUrl
        }
      }
    }
  }
`;