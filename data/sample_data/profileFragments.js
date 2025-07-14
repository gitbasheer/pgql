const rgbaFragment = `
  r
  g
  b
  a
`;

const hslaFragment = `
  h
  s
  l
  a
`;

const colorTypesFragment = `
  hex
  rgba {
    ${rgbaFragment}
  }
  rgbaNorm {
    ${rgbaFragment}
  }
  hsla {
    ${hslaFragment}
  }
  hslaNorm {
    ${hslaFragment}
  }
`;

const colorFragment = `
  accentColor {
    ${colorTypesFragment}
  }
  backgroundColor {
    ${colorTypesFragment}
  }
  primaryTextColor {
    ${colorTypesFragment}
  }
  secondaryTextColor {
    ${colorTypesFragment}
  }
  iconColor {
    ${colorTypesFragment}
  }
  primaryColorPalette {
    ${colorTypesFragment}
  }
  accentColorPalette {
    ${colorTypesFragment}
  }
`;

export const ventureInferredFragment = `
  inferred {
    name
    vertical
    personalityKeywords
    businessStyles
    tagLines
    description
    websiteNeedsStore
    websiteNeedsAppointments
    fullWebsiteHeadline
    fullWebsiteSubhead
    fullWebsiteCTA
    logoUrl
    photoKeywords
    photoKeywordPhrases
    status {
      logosRendered
    }
    brands {
      businessStyle
      logos {
        id
        width
        height
        imageUrl
        template
        projectSpecUri
      }
      primaryText
      secondaryText
      primaryFont {
        type
      }
      secondaryFont {
        type
      }
      icon {
        ... on InferredBrandURLIcon {
          url
        }
        ... on InferredBrandFlaticonIcon {
          thumbnailUrl
        }
      }
      colors {
        ${colorFragment}
      }
      titleFont {
        ... on InferredBrandStudioFont {
          family
        }
      }
      bodyFont {
        ... on InferredBrandStudioFont {
          family
        }
      }
    }
  }
`;

export const profileInfinityStoneFragment = `
  ${ventureInferredFragment}
  aapOnboarded
  aiOnboarded
  category
  lastVisited
  numVisits
`;
