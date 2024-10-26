const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { ApolloServerPluginLandingPageLocalDefault } = require('@apollo/server/plugin/landingPage/default');

const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const cors = require('cors');

const path = require('path');
import bodyParser from "body-parser";
import _ from "lodash";

import typeDefs from "./typeDefs";
import resolvers from "./resolvers";

import connection from './mongo'

const logger = require("./utils/logger");
const { graphqlUploadExpress } = require('graphql-upload');

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
let subscriptionCount = [];

// Create a logging plugin
const loggingPlugin = {
  async requestDidStart(requestContext) {
    return {
      async didEncounterErrors(requestContext) {
        for (const err of requestContext.errors) {
          logger.error(`Error: ${err.message}`, { err });
        }
      },
      async willSendResponse(requestContext) {},
    };
  },
};

// Create an Apollo Server instance
const server = new ApolloServer({ 
  schema, 
  plugins: [ApolloServerPluginLandingPageLocalDefault(), loggingPlugin],
  // introspection: process.env.NODE_ENV !== 'production', 
  context: ({ req }) => {
    return { req: req.headers };
  },
  formatError: (error) => {
    return error; 
  }
});

// Start the server
server.start().then(() => {
  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 10 }));
  app.use('/images', express.static("/app/uploads"));
  app.use(bodyParser.json());
  app.use(bodyParser.json({ type: "text/*" }));
  app.use(bodyParser.urlencoded({ extended: false }));

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:1984'
    // Add more origins as needed
  ];
  // Configure CORS
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS : ${ origin }`));
      }
    },
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
  });
  // Apply middleware to the Express app
  app.use('/graphql', expressMiddleware(
                    server , 
                    { context: async ({ req }) => ({ req: req.headers }),}));

  app.get('/health', (req, res) => {
    res.status(200).send('health' + subscriptionCount.toString());
  });
  // Create an HTTP server
  const httpServer = app.listen(4000, () => {
    console.log('Server is now running on http://localhost:1984/graphql');
  });
  // Create a WebSocket server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });
  useServer(
    {
      schema,
      onConnect: async(ctx) => {
        console.log("onConnect")
      },
      onSubscribe: (ctx, msg) => {
        console.log('onSubscribe');
      },
      onDisconnect: async(ctx, code, reason) => {
        console.log('Client disconnected');
      },
    },
    wsServer
  );
});
