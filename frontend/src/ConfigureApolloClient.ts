import { ApolloClient, InMemoryCache, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from "@apollo/client/utilities";
import { createUploadLink } from "apollo-upload-client";

// HTTP link for queries and mutations
const httpLink = createUploadLink({
  uri: 'http://localhost:1984/graphql', // Replace with your Apollo Server URL
});

// Function to create a WebSocket client with reconnection logic
const createWsLink = () => {
  const wsClient = createClient({
    url: 'ws://localhost:1984/graphql', // Your Apollo Server WebSocket endpoint
    connectionParams: {
      // Include any additional parameters needed for authentication
    },
    on: {
      connected: () => console.log('WebSocket connected'),
      closed: () => {
        console.log('WebSocket closed, attempting to reconnect...');
        connectWithRetry();
      },
      error: (error) => console.error('WebSocket error', error),
    },
  });

  let retries = 0;
  const maxRetries = 10; // Maximum number of reconnection attempts
  const retryDelay = 1000; // Delay between reconnection attempts in milliseconds

  const connectWithRetry = () => {
    if (retries < maxRetries) {
      setTimeout(() => {
        console.log(`Attempting to reconnect... (Attempt ${retries + 1}/${maxRetries})`);
        retries++;
        createWsLink(); // Create a new client instance to reconnect
      }, retryDelay);
    } else {
      console.error('Max reconnection attempts reached. Please check your connection.');
    }
  };

  return new GraphQLWsLink(wsClient);
};

// Create the WebSocket link
let wsLink = createWsLink();

// Combine the HTTP link and WebSocket link
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

// Create Apollo Client
const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  connectToDevTools: true,
});

export default client;