/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_AUTH_IDP: string
  readonly REACT_APP_CUST_IDP: string
  readonly REACT_APP_INFO_CUST_IDP: string
  readonly REACT_APP_INFO_IDP: string
  readonly REACT_APP_APOLLO_PG_ENDPOINT: string
  readonly REACT_APP_TEST_API_URL: string
  readonly REACT_APP_TEST_ACCOUNT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// For compatibility with process.env in existing code
declare global {
  namespace NodeJS {
    interface Global {}
    interface ProcessEnv {
      REACT_APP_AUTH_IDP: string
      REACT_APP_CUST_IDP: string
      REACT_APP_INFO_CUST_IDP: string
      REACT_APP_INFO_IDP: string
      REACT_APP_APOLLO_PG_ENDPOINT: string
      REACT_APP_TEST_API_URL: string
      REACT_APP_TEST_ACCOUNT_ID: string
    }
    interface Timeout {}
  }
  
  var process: {
    env: NodeJS.ProcessEnv
  }
}

declare module 'react-modal';