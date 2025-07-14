const { gql } = require('@apollo/client/core');

export const getTransitionsQuery = () => {
  return gql`
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
};

// eslint-disable-next-line id-length
export const getModifyBasketWithOptionsQuery = () => {
  return gql`
    mutation ModifyBasketWithOptions($data: ModifyBasketWithOptionsInput!) {
      modifyBasketWithOptions(data: $data)
    }
  `;
};
