# Use the official Node.js image as the base image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) first
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --save --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Expose the port
EXPOSE 5173

# Command to run the app in development mode
CMD ["npm", "run", "dev"]