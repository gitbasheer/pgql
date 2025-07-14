import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { ToastContainer } from 'react-toastify';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';

// Create GraphQL client with configurable endpoint
const createApolloClient = (uri: string = 'https://api.example.com/graphql') => {
  const httpLink = createHttpLink({ uri });

  const authLink = setContext((_, { headers }) => {
    // Get auth tokens from localStorage or context if available
    const token = localStorage.getItem('auth-token');
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    };
  });

  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    // Enable query validation for migration testing
    defaultOptions: {
      watchQuery: {
        errorPolicy: 'all', // Show partial data and errors
      },
      query: {
        errorPolicy: 'all',
      },
    },
  });
};

function App() {
  // Use default client, can be updated dynamically during pipeline runs
  const client = createApolloClient();

  return (
    <ApolloProvider client={client}>
      <ErrorBoundary>
        <div className="app">
          <Dashboard />
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
        </div>
      </ErrorBoundary>
    </ApolloProvider>
  );
}

export default App;