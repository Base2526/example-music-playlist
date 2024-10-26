import React from 'react';
import { createRoot } from 'react-dom/client'; // Import createRoot

import { ApolloProvider } from '@apollo/client';
import client from '@/ConfigureApolloClient';

import App from '@/App';
const container = document.getElementById('root'); // Get the root element

if (container) {
  const root = createRoot(container!); // Create a root
  root.render(<ApolloProvider client={client}><App /></ApolloProvider>); // Render the App component
} else {
  console.error('Root element not found');
}
