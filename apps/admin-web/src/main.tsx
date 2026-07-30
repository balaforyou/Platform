import React from 'react';
import ReactDOM from 'react-dom/client';

/**
 * Main application component for the Admin Web Console.
 */
function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Admin Web Console</h1>
      <p>Badminton platform admin management interface.</p>
    </div>
  );
}

// WHY: Render the App component into the root DOM node once it is loaded.
// If the root element is missing, throw an error to fail early during setup.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element to mount React application.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
