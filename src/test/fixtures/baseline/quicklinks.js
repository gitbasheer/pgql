import { gql } from '@apollo/client';

const quickLinksQuery = gql`
  query getQuickLinksData($ventureId: UUID!) {
    venture(ventureId: $ventureId) {
      projects {
        id
        billing {
          id
          plan
        }
        domain
        group
        product {
          type
          ...on O365Product {
            email_user
          }
          ...on WordpressProduct {
            accountStatus
            id
            sites {
              blogTitle
              siteUid
              cName
              status
              published
            }
          }
          ...on WebsiteProduct{
            isPublished
            planType
            properties
          }
        }
        status
        subscription {
          commonName
          id
          productName
          status
        }
      }
    }
  }
`;

export default quickLinksQuery;
