import React from 'react';
import { gql, useQuery } from '@apollo/client';

// vnext-dashboard React components with GraphQL
export const VenturesDashboard: React.FC = () => {
  const GET_USER_VENTURES = gql`
    query GetUserVentures($userId: ID!) {
      user(id: $userId) {
        id
        name
        ventures {
          id
          name
          domain
          projects {
            id
            name
            type
            ${queryNames.projectDetails || 'status'}
          }
        }
      }
    }
  `;

  const { data } = useQuery(GET_USER_VENTURES);
  return <div>Ventures Dashboard</div>;
};

export const ProjectSettings: React.FC = () => {
  const UPDATE_PROJECT = gql`
    mutation UpdateProject($projectId: ID!, $settings: ProjectInput!) {
      updateProject(id: $projectId, settings: $settings) {
        id
        name
        settings {
          theme
          features
          @experimentalOptIn(feature: "newUI")
        }
      }
    }
  `;

  return <div>Project Settings</div>;
};

// Template variables simulation
const queryNames = {
  projectDetails: 'details { createdAt updatedAt }',
  userProfile: 'profile { avatar email }'
};