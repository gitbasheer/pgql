import { gql } from '@apollo/client';

export const GET_PRODUCT_OFFERS = gql`
  query GetProductOffers($domain: String!) {
    offers(domain: $domain) {
      id
      product {
        type
        price
        features
      }
      discount {
        percentage
        expires
      }
    }
  }
`;

export const GET_CART_SUMMARY = gql`
  query GetCartSummary {
    cart {
      items {
        id
        product {
          name
          price
        }
        quantity
      }
      total
      tax
    }
  }
`;
