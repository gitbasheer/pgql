import { gql } from 'graphql-tag';

// Mock vnext-dashboard queries for testing
export const GET_VENTURES = gql`
  query GetVentures($userId: ID!) {
    user(id: $userId) {
      id
      ventures {
        id
        name
        domain
        status
        projects {
          id
          name
          type
        }
      }
    }
  }
`;

export const GET_PROJECT_DETAILS = gql`
  query GetProjectDetails($projectId: ID!) {
    project(id: $projectId) {
      id
      name
      domain
      status
      settings {
        theme
        features
      }
      metrics {
        views
        conversions
      }
    }
  }
`;

export const UPDATE_PROJECT_SETTINGS = gql`
  mutation UpdateProjectSettings($projectId: ID!, $settings: ProjectSettingsInput!) {
    updateProjectSettings(projectId: $projectId, settings: $settings) {
      id
      settings {
        theme
        features
      }
    }
  }
`;