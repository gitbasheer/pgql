import { ToastContainer } from 'react-toastify';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';

function App() {
  return (
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
  );
}

export default App;